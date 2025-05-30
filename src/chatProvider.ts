import * as vscode from 'vscode';
import { AgentManager } from './agent/agentManager';
import { IAgent, AgentRequest, AgentCallbacks, AgentMessage } from './agent/agentInterface';
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
                onMessage: (message: AgentMessage) => {
                    responseContent += this.formatAgentMessage(message);
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
     * 处理用户问题 - 流式
     */
    async askQuestionStream(question: string, onChunk: (chunk: string) => void): Promise<string> {
        const sessionId = `chat_stream_${Date.now()}`;
        logger.startTimer(sessionId);

        try {
            logger.chatUserInput(question, { sessionId, streaming: true });

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

            // 流式回调 - 直接转发 Agent 的输出
            let responseContent = '';
            const callbacks: AgentCallbacks = {
                onMessage: (message: AgentMessage) => {
                    const formattedMessage = this.formatAgentMessage(message);
                    responseContent += formattedMessage;
                    onChunk(formattedMessage); // 实时发送给前端
                    logger.chatDebug(`Agent message: ${message.type}`, { content: message.content.substring(0, 100) }, sessionId);
                },
                onComplete: (result: string) => {
                    logger.chatDebug('Agent completed', { resultLength: result.length }, sessionId);
                },
                onError: (error: string) => {
                    const errorMsg = `❌ 错误: ${error}\n`;
                    responseContent += errorMsg;
                    onChunk(errorMsg);
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

            logger.endTimer(sessionId, 'ChatStreamRequest');
            return finalResponse;

        } catch (error) {
            logger.error('Error in ChatProvider.askQuestionStream:', error, { sessionId });
            logger.endTimer(sessionId, 'ChatStreamError');
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorResponse = `Error: ${errorMessage}`;
            onChunk(errorResponse);
            return errorResponse;
        }
    }

    /**
     * 格式化 Agent 消息 - 可配置的格式化器
     */
    private formatAgentMessage(message: AgentMessage): string {
        // 这里可以根据配置使用不同的格式化器
        // 目前使用简单的默认格式
        switch (message.type) {
            case 'task_start':
                return `🚀 ${message.content}\n\n`;
            case 'plan':
                return `📋 ${message.content}\n\n`;
            case 'step_start':
                return `⚡ ${message.content}\n`;
            case 'step_complete':
                return `${message.content}\n`;
            case 'progress':
                return `${message.content}\n`;
            case 'task_complete':
                return `\n🎉 ${message.content}\n\n`;
            case 'error':
                return `❌ ${message.content}\n`;
            case 'thinking':
                return `💭 ${message.content}\n`;
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
