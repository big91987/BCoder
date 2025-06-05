/**
 * 结构化流式解析器
 * 解析 LLM 的结构化输出格式：
 * THOUGHT: [思考内容]
 * ACTION: [工具名称或NONE]
 * ACTION_INPUT: [工具参数JSON或空]
 * FINAL_ANSWER: [最终回答内容]
 */

import { logger } from './logger';

export interface ParseResult {
    type: 'thought' | 'action' | 'action_input' | 'final_answer_start' | 'final_answer_continue' | 'final_answer_delta' | 'waiting';
    content: string | any;
}

export class StructuredStreamParser {
    private buffer = '';
    private currentSection: 'THOUGHT' | 'ACTION' | 'ACTION_INPUT' | 'FINAL_ANSWER' | null = null;
    private extractedSections = new Set<string>();
    private finalAnswerContent = '';
    private lastFinalAnswerLength = 0;
    private fallbackMode = false;
    private timeout: NodeJS.Timeout | null = null;

    constructor() {
        // 设置超时，如果长时间没有识别到格式，切换到回退模式
        this.resetTimeout();
    }

    private resetTimeout() {
        if (this.timeout) clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            logger.warn('StructuredStreamParser: Timeout reached, switching to fallback mode');
            this.fallbackMode = true;
        }, 10000); // 10秒超时
    }

    parse(chunk: string): ParseResult[] {
        this.buffer += chunk;
        const results: ParseResult[] = [];

        // 如果进入回退模式，直接返回文本内容
        if (this.fallbackMode) {
            return [{ type: 'final_answer_delta', content: chunk }];
        }

        // 重置超时
        this.resetTimeout();

        // 按行分割，但保留最后可能不完整的行
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || ''; // 保留最后一行

        for (const line of lines) {
            const result = this.parseLine(line);
            if (result) {
                results.push(result);
            }
        }

        // 检查缓冲区中是否有新的section开始或增量内容
        const bufferResult = this.parseBuffer();
        if (bufferResult) {
            results.push(bufferResult);
        }

        return results;
    }

    private parseLine(line: string): ParseResult | null {
        const trimmed = line.trim();

        // 检测新的section开始
        if (trimmed.startsWith('THOUGHT:')) {
            this.currentSection = 'THOUGHT';
            const content = trimmed.substring(8).trim();
            if (content && !this.extractedSections.has('THOUGHT')) {
                this.extractedSections.add('THOUGHT');
                logger.debug('StructuredStreamParser: Extracted THOUGHT:', content);
                return { type: 'thought', content };
            }
        }

        else if (trimmed.startsWith('ACTION:')) {
            this.currentSection = 'ACTION';
            const content = trimmed.substring(7).trim();
            if (content && content !== 'NONE') {
                logger.debug('StructuredStreamParser: Extracted ACTION:', content);
                return { type: 'action', content };
            }
        }

        else if (trimmed.startsWith('ACTION_INPUT:')) {
            this.currentSection = 'ACTION_INPUT';
            const content = trimmed.substring(13).trim();
            if (content) {
                try {
                    const parsed = JSON.parse(content);
                    logger.debug('StructuredStreamParser: Extracted ACTION_INPUT:', parsed);
                    return { type: 'action_input', content: parsed };
                } catch (e) {
                    logger.warn('StructuredStreamParser: Failed to parse ACTION_INPUT JSON:', content);
                    return { type: 'action_input', content: {} };
                }
            }
        }

        else if (trimmed.startsWith('FINAL_ANSWER:')) {
            this.currentSection = 'FINAL_ANSWER';
            const content = trimmed.substring(13).trim();
            if (content) {
                this.finalAnswerContent = content;
                this.lastFinalAnswerLength = content.length;
                logger.debug('StructuredStreamParser: Started FINAL_ANSWER:', content);
                return { type: 'final_answer_start', content };
            } else {
                // FINAL_ANSWER: 后面没有内容，等待下一行
                this.finalAnswerContent = '';
                this.lastFinalAnswerLength = 0;
                return null;
            }
        }

        // 处理多行内容（特别是FINAL_ANSWER）
        else if (this.currentSection === 'FINAL_ANSWER' && trimmed) {
            this.finalAnswerContent += '\n' + trimmed;
            logger.debug('StructuredStreamParser: Continue FINAL_ANSWER:', trimmed);
            return { type: 'final_answer_continue', content: trimmed };
        }

        return null;
    }

    private parseBuffer(): ParseResult | null {
        // 处理缓冲区中可能的不完整行
        if (this.currentSection === 'FINAL_ANSWER' && this.buffer.trim()) {
            const newContent = this.buffer.trim();
            
            // 检查是否有新的增量内容
            const fullContent = this.finalAnswerContent + newContent;
            if (fullContent.length > this.lastFinalAnswerLength) {
                const deltaContent = fullContent.substring(this.lastFinalAnswerLength);
                this.lastFinalAnswerLength = fullContent.length;
                this.finalAnswerContent = fullContent;
                
                logger.debug('StructuredStreamParser: Delta FINAL_ANSWER:', deltaContent);
                return { type: 'final_answer_delta', content: deltaContent };
            }
        }

        return null;
    }

    /**
     * 获取当前解析状态
     */
    getState() {
        return {
            currentSection: this.currentSection,
            extractedSections: Array.from(this.extractedSections),
            finalAnswerLength: this.finalAnswerContent.length,
            fallbackMode: this.fallbackMode
        };
    }

    /**
     * 重置解析器状态
     */
    reset() {
        this.buffer = '';
        this.currentSection = null;
        this.extractedSections.clear();
        this.finalAnswerContent = '';
        this.lastFinalAnswerLength = 0;
        this.fallbackMode = false;
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.resetTimeout();
        logger.debug('StructuredStreamParser: Reset');
    }

    /**
     * 清理资源
     */
    dispose() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    }
}
