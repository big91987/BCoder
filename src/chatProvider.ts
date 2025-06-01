import * as vscode from 'vscode';
import { AgentManager } from './agent/agentManager';
import { IAgent, AgentRequest, AgentCallbacks } from './agent/agentInterface';
import { StandardMessage } from './types/message';
import { logger } from './utils/logger';

/**
 * 重构后的 ChatProvider - 纯桥接模式
 * 职责：
 * 1. 接收用户输入
 * 2. 转发给配置的 Agent
 * 3. 接收 Agent 的标准化输出
 * 4. 转发给前端显示
 */
export class ChatProvider {
    private agentManager: AgentManager;
    private conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [];

    constructor(agentManager: AgentManager) {
        this.agentManager = agentManager;
        logger.info('🌉 ChatProvider initialized as bridge');
    }

    /**
     * 处理用户问题 - 非流式
     */
    async askQuestion(question: string): Promise<string> {
        const sessionId = `chat_${Date.now()}`;
        logger.startTimer(sessionId);

        try {
            logger.chatUserInput(question, { sessionId, streaming: false });

            // 添加到历史记录
            this.conversationHistory.push({ role: 'user', content: question });

            // 获取当前 Agent
            const agent = this.agentManager.getCurrentAgent();
            if (!agent) {
                throw new Error('No agent available');
            }

            // 构建请求
            const request: AgentRequest = {
                message: question,
                context: await this.getWorkspaceContext(),
                sessionId
            };

            // 收集 Agent 输出
            let responseContent = '';
            const callbacks: AgentCallbacks = {
                onMessage: (message: StandardMessage) => {
                    responseContent += this.formatMessage(message);
                    logger.chatDebug(`Agent message: ${message.type}`, { content: message.content.substring(0, 100) }, sessionId);
                },
                onComplete: (result: string) => {
                    logger.chatDebug('Agent completed', { resultLength: result.length }, sessionId);
                },
                onError: (error: string) => {
                    responseContent += `❌ 错误: ${error}\n`;
                    logger.error('Agent error:', error, { sessionId });
                }
            };

            // 调用 Agent
            const response = await agent.processRequest(request, callbacks);

            // 使用 Agent 返回的最终结果，如果没有中间消息的话
            const finalResponse = responseContent || response.result;

            // 添加到历史记录
            this.conversationHistory.push({ role: 'assistant', content: finalResponse });

            // 限制历史记录长度
            this.limitConversationHistory();

            logger.endTimer(sessionId, 'ChatRequest');
            return finalResponse;

        } catch (error) {
            logger.error('Error in ChatProvider.askQuestion:', error, { sessionId });
            logger.endTimer(sessionId, 'ChatError');
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return `Error: ${errorMessage}`;
        }
    }



    /**
     * 结构化消息问答 - 直接传递 Agent 消息
     */
    async askQuestionWithStructuredMessages(question: string, onAgentMessage: (message: any) => void): Promise<string> {
        const sessionId = `chat_stream_${Date.now()}`;
        logger.startTimer(sessionId);
        logger.info('[UserInput] User input received', {
            message: question,
            context: {
                sessionId,
                streaming: true,
                structured: true
            }
        });

        try {
            // 添加用户消息到历史记录
            this.conversationHistory.push({ role: 'user', content: question });

            // 获取当前 Agent
            const agent = this.agentManager.getCurrentAgent();
            if (!agent) {
                throw new Error('No agent available');
            }

            // 构建请求，包含对话历史
            const request: AgentRequest = {
                message: question,
                context: await this.getWorkspaceContext(),
                sessionId,
                conversationHistory: [...this.conversationHistory] // 传递对话历史副本
            };

            // 创建回调处理器 - 直接传递结构化消息
            let responseContent = '';
            const callbacks: AgentCallbacks = {
                onMessage: (message: StandardMessage) => {
                    // 直接传递结构化消息，添加 sessionId
                    onAgentMessage({
                        ...message,
                        sessionId
                    });

                    // 同时格式化用于历史记录
                    const formattedMessage = this.formatMessage(message);
                    responseContent += formattedMessage;
                },
                onComplete: (result: string) => {
                    logger.chatDebug('Agent completed', { resultLength: result.length }, sessionId);
                },
                onError: (error: string) => {
                    const errorMsg = `❌ 错误: ${error}\n`;
                    responseContent += errorMsg;

                    // 发送错误消息
                    onAgentMessage({
                        type: 'error',
                        content: errorMsg,
                        data: { error },
                        timestamp: new Date(),
                        sessionId
                    });
                }
            };

            // 调用 Agent
            const response = await agent.processRequest(request, callbacks);

            // 使用 Agent 返回的最终结果，如果没有中间消息的话
            const finalResponse = responseContent || response.result;

            // 添加到历史记录
            this.conversationHistory.push({ role: 'assistant', content: finalResponse });

            // 限制历史记录长度
            this.limitConversationHistory();

            logger.endTimer(sessionId, 'ChatStreamRequest');
            return finalResponse;

        } catch (error) {
            logger.error('Error in ChatProvider.askQuestionWithStructuredMessages:', error, { sessionId });
            logger.endTimer(sessionId, 'ChatStreamError');
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorResponse = `Error: ${errorMessage}`;

            // 发送错误消息
            onAgentMessage({
                type: 'error',
                content: errorResponse,
                data: { error: errorMessage },
                timestamp: new Date(),
                sessionId
            });

            return errorResponse;
        }
    }

    /**
     * 格式化消息 - 支持新旧两种消息格式
     */
    private formatMessage(message: StandardMessage): string {
        // 统一使用 StandardMessage 格式
        return this.formatStandardMessage(message);
    }

    /**
     * 格式化标准化消息
     */
    private formatStandardMessage(message: StandardMessage): string {
        switch (message.type) {
            // 工具相关消息
            case 'tool_start':
                return `🔧 ${message.content}\n`;
            case 'tool_result':
                return `✅ ${message.content}\n`;
            case 'tool_error':
                return `❌ ${message.content}\n`;
            case 'tool_progress':
                const progress = message.metadata?.progress?.current || 0;
                const total = message.metadata?.progress?.total || 100;
                return `⏳ ${message.content} (${Math.round(progress/total*100)}%)\n`;

            // 思考和规划
            case 'thinking':
                return `💭 思考: ${message.content}\n`;
            case 'planning':
                return `📋 规划: ${message.content}\n\n`;

            // 任务流程
            case 'task_start':
                return `🚀 ${message.content}\n\n`;
            case 'task_complete':
                return `\n🎉 ${message.content}\n\n`;

            // 系统信息
            case 'info':
                return `ℹ️ ${message.content}\n`;
            case 'error':
                return `❌ ${message.content}\n`;
            case 'warning':
                return `⚠️ ${message.content}\n`;

            // 基础消息
            case 'text':
                return `${message.content}\n`;

            default:
                return `${message.content}\n`;
        }
    }



    /**
     * 获取工作区上下文
     */
    private async getWorkspaceContext(): Promise<any> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                return { workspaceRoot: vscode.workspace.rootPath };
            }

            const document = activeEditor.document;
            return {
                workspaceRoot: vscode.workspace.rootPath,
                activeFile: document.fileName,
                language: document.languageId,
                selectedText: document.getText(activeEditor.selection),
                cursorPosition: {
                    line: activeEditor.selection.active.line,
                    character: activeEditor.selection.active.character
                }
            };
        } catch (error) {
            logger.error('Error getting workspace context:', error);
            return { workspaceRoot: vscode.workspace.rootPath };
        }
    }

    /**
     * 限制对话历史长度
     */
    private limitConversationHistory(): void {
        if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
        }
    }

    /**
     * 切换 Agent
     */
    async switchAgent(agentType: string, config?: Record<string, any>): Promise<void> {
        await this.agentManager.switchAgent(agentType, config);
        logger.info(`🔄 Switched to agent: ${agentType}`);
    }

    /**
     * 获取当前 Agent 信息
     */
    getCurrentAgentInfo(): any {
        const agent = this.agentManager.getCurrentAgent();
        if (!agent) {
            return null;
        }

        return {
            config: agent.config,
            status: agent.getStatus()
        };
    }

    /**
     * 获取可用的 Agent 列表
     */
    getAvailableAgents(): Array<{ type: string; config: any }> {
        return this.agentManager.getAvailableAgents();
    }

    /**
     * 清空对话历史
     */
    clearHistory(): void {
        this.conversationHistory = [];
        logger.info('🗑️ Conversation history cleared');
    }

    /**
     * 获取对话历史
     */
    getHistory(): Array<{role: 'user' | 'assistant', content: string}> {
        return [...this.conversationHistory];
    }

    /**
     * 停止当前 Agent 执行
     */
    async stopCurrentExecution(): Promise<void> {
        const agent = this.agentManager.getCurrentAgent();
        if (agent) {
            await agent.stop();
            logger.info('🛑 Current agent execution stopped');
        }
    }

    /**
     * 解释代码 - 向后兼容方法
     */
    async explainCode(code: string): Promise<string> {
        const request = `请解释以下代码的功能和工作原理：\n\n\`\`\`\n${code}\n\`\`\``;
        return await this.askQuestion(request);
    }

    /**
     * 生成代码 - 向后兼容方法
     */
    async generateCode(prompt: string, language?: string): Promise<string> {
        const languageHint = language ? ` (使用 ${language} 语言)` : '';
        const request = `请根据以下需求生成代码${languageHint}：\n\n${prompt}`;
        return await this.askQuestion(request);
    }

    /**
     * 清理资源
     */
    async dispose(): Promise<void> {
        await this.agentManager.dispose();
        this.conversationHistory = [];
        logger.info('🗑️ ChatProvider disposed');
    }
}
