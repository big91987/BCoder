/**
 * 流式解析器组件
 * 独立的解析器，可以被任何Agent使用
 * 支持标准化消息格式和流式处理
 */

import { StandardMessage, MessageFactory, MessageStatus } from '../types/message';

/**
 * 解析结果接口
 */
export interface ParseResult {
    /** 思考内容 */
    thought?: string;
    /** 工具名称 */
    action?: string;
    /** 工具参数 */
    actionInput?: any;
    /** 最终答案 */
    finalAnswer?: string;
}

/**
 * 流式消息累积器
 * 管理不同类型消息的流式状态
 */
export class StreamingAccumulator {
    private accumulators: Map<string, {
        role: string;
        type: string;
        content: string;
        metadata?: any;
        startTime: Date;
    }> = new Map();

    /**
     * 开始新的流式消息
     */
    start(
        id: string, 
        role: string, 
        type: string, 
        initialContent: string = '', 
        metadata?: any
    ): StandardMessage {
        this.accumulators.set(id, {
            role,
            type,
            content: initialContent,
            metadata,
            startTime: new Date()
        });

        return {
            role,
            type,
            content: initialContent,
            status: 'start',
            metadata,
            timestamp: new Date(),
            id
        };
    }

    /**
     * 添加流式内容片段
     */
    delta(id: string, deltaContent: string): StandardMessage | null {
        const accumulator = this.accumulators.get(id);
        if (!accumulator) {
            return null;
        }

        accumulator.content += deltaContent;

        return {
            role: accumulator.role,
            type: accumulator.type,
            content: deltaContent, // delta消息只包含增量内容
            status: 'delta',
            metadata: accumulator.metadata,
            timestamp: new Date(),
            id
        };
    }

    /**
     * 结束流式消息
     */
    end(id: string): StandardMessage | null {
        const accumulator = this.accumulators.get(id);
        if (!accumulator) {
            return null;
        }

        const finalMessage: StandardMessage = {
            role: accumulator.role,
            type: accumulator.type,
            content: accumulator.content, // end消息包含完整内容
            status: 'end',
            metadata: accumulator.metadata,
            timestamp: new Date(),
            id
        };

        // 清理累积器
        this.accumulators.delete(id);

        return finalMessage;
    }

    /**
     * 获取当前累积的内容
     */
    getCurrentContent(id: string): string {
        const accumulator = this.accumulators.get(id);
        return accumulator ? accumulator.content : '';
    }

    /**
     * 清理所有累积器
     */
    clear(): void {
        this.accumulators.clear();
    }
}

/**
 * 流式解析器
 * 解析LLM的流式输出，支持ReAct格式
 */
export class StreamingParser {
    private accumulator = new StreamingAccumulator();
    private currentStreamId: string | null = null;

    /**
     * 解析流式响应（实时解析，支持单行和多行格式）
     */
    parseStreamingResponse(partialResponse: string): ParseResult {
        const result: ParseResult = {};

        // 解析 THOUGHT（支持单行和多行格式，包括换行符）
        const thoughtMatch = partialResponse.match(/THOUGHT:\s*(.+?)(?=\s*(?:ACTION|FINAL_ANSWER)|$)/s);
        if (thoughtMatch) {
            result.thought = thoughtMatch[1].trim();
        }

        // 解析 ACTION（必须完整）
        const actionMatch = partialResponse.match(/ACTION:\s*(.+?)(?=\s*(?:ACTION_INPUT|THOUGHT|FINAL_ANSWER)|$)/s);
        if (actionMatch) {
            result.action = actionMatch[1].trim();
        }

        // 解析 ACTION_INPUT（必须完整）
        const actionInputMatch = partialResponse.match(/ACTION_INPUT:\s*(.+?)(?=\s*(?:THOUGHT|FINAL_ANSWER)|$)/s);
        if (actionInputMatch) {
            const rawActionInput = actionInputMatch[1].trim();
            try {
                result.actionInput = JSON.parse(rawActionInput);
            } catch (error) {
                // 如果 JSON 解析失败，可能是不完整的，暂时不处理
                result.actionInput = null;
            }
        }

        // 解析 FINAL_ANSWER（支持单行和多行格式，包括换行符）
        const finalAnswerMatch = partialResponse.match(/FINAL_ANSWER:\s*(.+?)$/s);
        if (finalAnswerMatch) {
            result.finalAnswer = finalAnswerMatch[1].trim();
        }

        return result;
    }

    /**
     * 处理流式内容，生成标准化消息
     */
    processStreamingContent(
        chunk: string,
        role: string = 'assistant',
        onMessage: (message: StandardMessage) => void
    ): void {
        const parseResult = this.parseStreamingResponse(chunk);

        // 处理思考内容
        if (parseResult.thought) {
            this.handleThoughtStream(parseResult.thought, role, onMessage);
        }

        // 处理最终答案
        if (parseResult.finalAnswer) {
            this.handleTextStream(parseResult.finalAnswer, role, onMessage);
        }
    }

    /**
     * 处理思考流式内容
     */
    private handleThoughtStream(
        thought: string,
        role: string,
        onMessage: (message: StandardMessage) => void
    ): void {
        const streamId = 'think_stream';
        
        if (!this.currentStreamId || this.currentStreamId !== streamId) {
            // 开始新的思考流
            this.currentStreamId = streamId;
            const startMessage = this.accumulator.start(streamId, role, 'think', thought);
            onMessage(startMessage);
        } else {
            // 继续思考流
            const currentContent = this.accumulator.getCurrentContent(streamId);
            if (thought.length > currentContent.length) {
                const deltaContent = thought.substring(currentContent.length);
                const deltaMessage = this.accumulator.delta(streamId, deltaContent);
                if (deltaMessage) {
                    onMessage(deltaMessage);
                }
            }
        }
    }

    /**
     * 处理文本流式内容
     */
    private handleTextStream(
        text: string,
        role: string,
        onMessage: (message: StandardMessage) => void
    ): void {
        const streamId = 'text_stream';
        
        if (!this.currentStreamId || this.currentStreamId !== streamId) {
            // 结束之前的流（如果有）
            if (this.currentStreamId) {
                const endMessage = this.accumulator.end(this.currentStreamId);
                if (endMessage) {
                    onMessage(endMessage);
                }
            }
            
            // 开始新的文本流
            this.currentStreamId = streamId;
            const startMessage = this.accumulator.start(streamId, role, 'text', text);
            onMessage(startMessage);
        } else {
            // 继续文本流
            const currentContent = this.accumulator.getCurrentContent(streamId);
            if (text.length > currentContent.length) {
                const deltaContent = text.substring(currentContent.length);
                const deltaMessage = this.accumulator.delta(streamId, deltaContent);
                if (deltaMessage) {
                    onMessage(deltaMessage);
                }
            }
        }
    }

    /**
     * 完成当前流式处理
     */
    completeCurrentStream(onMessage: (message: StandardMessage) => void): void {
        if (this.currentStreamId) {
            const endMessage = this.accumulator.end(this.currentStreamId);
            if (endMessage) {
                onMessage(endMessage);
            }
            this.currentStreamId = null;
        }
    }

    /**
     * 重置解析器状态
     */
    reset(): void {
        this.accumulator.clear();
        this.currentStreamId = null;
    }

    /**
     * 创建工具消息
     */
    createToolMessage(
        content: string,
        status: MessageStatus,
        role: string = 'assistant',
        toolName?: string,
        success?: boolean,
        data?: any
    ): StandardMessage {
        return MessageFactory.toolMessage(content, status, role, toolName, success, data);
    }

    /**
     * 创建错误消息
     */
    createErrorMessage(content: string, role: string = 'assistant', error?: string): StandardMessage {
        return MessageFactory.errorMessage(content, role, error);
    }
}
