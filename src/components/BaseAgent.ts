/**
 * Agent基类示例
 * 展示如何使用标准化消息格式和流式解析器构建Agent
 */

import { StandardMessage, MessageFactory, MessageType } from '../types/message';
import { StreamingParser, ParseResult } from './StreamingParser';

/**
 * Agent回调接口
 */
export interface AgentCallbacks {
    /** 消息回调 */
    onMessage: (message: StandardMessage) => void;
}

/**
 * Agent基类
 * 提供标准化的消息处理和流式解析能力
 */
export abstract class BaseAgent {
    protected parser = new StreamingParser();
    protected role: string;
    protected maxIterations: number = 10;

    constructor(role: string = 'assistant') {
        this.role = role;
    }

    /**
     * 处理用户消息的主要方法
     * 子类需要实现具体的处理逻辑
     */
    abstract processMessage(
        message: string, 
        callbacks: AgentCallbacks
    ): Promise<string>;

    /**
     * 执行ReAct循环的通用方法
     * 可以被子类重写或直接使用
     */
    protected async executeReActLoop(
        initialMessage: string,
        callbacks: AgentCallbacks,
        llmCall: (messages: any[]) => AsyncIterable<string>
    ): Promise<string> {
        let iteration = 0;
        let finalAnswer = '';
        const conversation: any[] = [
            { role: 'user', content: initialMessage }
        ];

        while (iteration < this.maxIterations && !finalAnswer) {
            iteration++;

            // 发送思考开始消息
            const thinkStartMsg = MessageFactory.thinkMessage('', 'start', this.role);
            callbacks.onMessage(thinkStartMsg);

            let fullResponse = '';
            let hasAction = false;
            let actionName = '';
            let actionInput: any = null;

            // 流式处理LLM响应
            for await (const chunk of llmCall(conversation)) {
                fullResponse += chunk;
                
                // 实时解析
                const parseResult = this.parser.parseStreamingResponse(fullResponse);
                
                // 处理思考内容
                if (parseResult.thought) {
                    const thinkDeltaMsg = MessageFactory.thinkMessage(
                        parseResult.thought, 
                        'delta', 
                        this.role
                    );
                    callbacks.onMessage(thinkDeltaMsg);
                }

                // 检查工具调用
                if (parseResult.action && parseResult.actionInput !== null && parseResult.actionInput !== undefined) {
                    actionName = parseResult.action;
                    actionInput = parseResult.actionInput;
                    hasAction = true;
                }

                // 处理最终答案
                if (parseResult.finalAnswer) {
                    finalAnswer = parseResult.finalAnswer;
                    
                    // 发送文本开始消息
                    const textStartMsg = MessageFactory.textMessage('', 'start', this.role);
                    callbacks.onMessage(textStartMsg);
                    
                    // 发送文本内容
                    const textDeltaMsg = MessageFactory.textMessage(finalAnswer, 'delta', this.role);
                    callbacks.onMessage(textDeltaMsg);
                    
                    // 发送文本结束消息
                    const textEndMsg = MessageFactory.textMessage(finalAnswer, 'end', this.role);
                    callbacks.onMessage(textEndMsg);
                    break;
                }
            }

            // 发送思考结束消息
            const thinkEndMsg = MessageFactory.thinkMessage(
                this.parser.parseStreamingResponse(fullResponse).thought || '', 
                'end', 
                this.role
            );
            callbacks.onMessage(thinkEndMsg);

            // 添加助手响应到对话历史
            conversation.push({ role: 'assistant', content: fullResponse });

            // 执行工具（如果有）
            if (hasAction && actionName && actionInput) {
                const toolResult = await this.executeTool(actionName, actionInput, callbacks);
                
                // 添加工具结果到对话历史
                const observation = toolResult.success 
                    ? `工具执行成功: ${JSON.stringify(toolResult.data)}`
                    : `工具执行失败: ${toolResult.error}`;
                
                conversation.push({ role: 'user', content: `Observation: ${observation}` });
                continue;
            }

            // 如果没有工具也没有最终答案，报错
            if (!hasAction && !finalAnswer) {
                const errorMsg = MessageFactory.errorMessage(
                    '解析失败：既没有工具调用也没有最终答案',
                    this.role
                );
                callbacks.onMessage(errorMsg);
                break;
            }
        }

        return finalAnswer || '任务执行完成，但未获得明确答案。';
    }

    /**
     * 执行工具的抽象方法
     * 子类需要实现具体的工具执行逻辑
     */
    protected abstract executeTool(
        toolName: string, 
        toolInput: any, 
        callbacks: AgentCallbacks
    ): Promise<{ success: boolean; data?: any; error?: string }>;

    /**
     * 发送工具开始消息的辅助方法
     */
    protected sendToolStartMessage(toolName: string, toolInput: any, callbacks: AgentCallbacks): void {
        const message = this.getToolStartMessage(toolName, toolInput);
        const toolStartMsg = MessageFactory.toolMessage(message, 'start', this.role, toolName);
        callbacks.onMessage(toolStartMsg);
    }

    /**
     * 发送工具结束消息的辅助方法
     */
    protected sendToolEndMessage(
        toolName: string, 
        toolInput: any, 
        result: { success: boolean; data?: any; error?: string }, 
        callbacks: AgentCallbacks
    ): void {
        const message = this.getToolEndMessage(toolName, result, toolInput);
        const toolEndMsg = MessageFactory.toolMessage(
            message, 
            'end', 
            this.role, 
            toolName, 
            result.success, 
            result.data
        );
        callbacks.onMessage(toolEndMsg);
    }

    /**
     * 获取工具开始消息的辅助方法
     * 子类可以重写以自定义消息格式
     */
    protected getToolStartMessage(toolName: string, toolInput: any): string {
        switch (toolName) {
            case 'read_file':
                return `📖 正在读取文件: ${toolInput.path}`;
            case 'write_file':
                return `✏️ 正在写入文件: ${toolInput.path}`;
            case 'list_files':
                return `📁 正在列出目录内容: ${toolInput.path || '.'}`;
            default:
                return `⚡ 正在执行: ${toolName}`;
        }
    }

    /**
     * 获取工具结束消息的辅助方法
     * 子类可以重写以自定义消息格式
     */
    protected getToolEndMessage(toolName: string, result: any, toolInput: any): string {
        if (!result.success) {
            return `❌ 操作失败: ${result.error}`;
        }

        switch (toolName) {
            case 'read_file':
                return `✅ 已读取文件: ${toolInput.path}`;
            case 'write_file':
                return `✅ 已写入文件: ${toolInput.path}`;
            case 'list_files':
                const fileCount = Array.isArray(result.data?.files) ? result.data.files.length : 0;
                return `✅ 找到 ${fileCount} 个文件/目录`;
            default:
                return `✅ 操作完成: ${toolName}`;
        }
    }

    /**
     * 重置Agent状态
     */
    reset(): void {
        this.parser.reset();
    }

    /**
     * 获取Agent状态
     */
    getStatus(): { isActive: boolean; role: string } {
        return {
            isActive: true,
            role: this.role
        };
    }
}

/**
 * 使用示例：简单的文件操作Agent
 */
export class ExampleFileAgent extends BaseAgent {
    constructor() {
        super('FileAgent');
    }

    async processMessage(message: string, callbacks: AgentCallbacks): Promise<string> {
        // 这里应该调用LLM API，这里只是示例
        const mockLLMCall = async function* (messages: any[]): AsyncIterable<string> {
            // 模拟流式响应
            const response = `THOUGHT: 用户想要操作文件，我需要分析具体需求。
ACTION: read_file
ACTION_INPUT: {"path": "example.txt"}`;
            
            for (const char of response) {
                yield char;
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        };

        return this.executeReActLoop(message, callbacks, mockLLMCall);
    }

    protected async executeTool(
        toolName: string, 
        toolInput: any, 
        callbacks: AgentCallbacks
    ): Promise<{ success: boolean; data?: any; error?: string }> {
        this.sendToolStartMessage(toolName, toolInput, callbacks);

        // 模拟工具执行
        await new Promise(resolve => setTimeout(resolve, 1000));

        const result = {
            success: true,
            data: { content: 'file content', size: 100 }
        };

        this.sendToolEndMessage(toolName, toolInput, result, callbacks);
        return result;
    }
}
