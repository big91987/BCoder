import * as vscode from 'vscode';
import { AIClient } from './utils/aiClient';
import { promptManager } from './utils/promptManager';
import { logger } from './utils/logger';
import { ToolSystem } from './tools';
import { ToolCall, ToolResult } from './tools/types';
import { AgentSystem, AgentCallbacks } from './agent';
import { AgentMessage, DefaultMessageFormatter, MessageFormatter } from './agent/messaging';

export class ChatProvider {
    private aiClient: AIClient;
    private conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [];
    private toolSystem: ToolSystem | null = null;
    private agentSystem: AgentSystem | null = null;
    private messageFormatter: MessageFormatter;

    constructor(aiClient: AIClient, toolSystem?: ToolSystem, agentSystem?: AgentSystem, messageFormatter?: MessageFormatter) {
        this.aiClient = aiClient;
        this.toolSystem = toolSystem || null;
        this.agentSystem = agentSystem || null;
        this.messageFormatter = messageFormatter || new DefaultMessageFormatter();
    }

    async askQuestion(question: string): Promise<string> {
        try {
            logger.info('ChatProvider.askQuestion called with question:', question);

            // Add user question to history
            this.conversationHistory.push({ role: 'user', content: question });
            logger.info('Added question to conversation history');

            // Get current workspace context
            const workspaceContext = await this.getWorkspaceContext();
            logger.info('Got workspace context:', workspaceContext);

            // 直接交给 Agent 系统处理 - 让 Agent 自己决定是否使用工具
            if (this.agentSystem) {
                const sessionId = `chat_${Date.now()}`;
                logger.startTimer(sessionId);
                logger.chatDebug('Routing to Agent system', {}, sessionId);

                const response = await this.handleAgentRequest(question, workspaceContext, sessionId);
                logger.endTimer(sessionId, 'AgentRequest');
                return response;
            }

            // 如果没有 Agent 系统，尝试工具调用
            if (this.toolSystem) {
                return await this.handleToolRequest(question, workspaceContext);
            }

            // 最后才是普通聊天
            const prompt = promptManager.getChatPrompt(question, workspaceContext);
            logger.info('Generated prompt using PromptManager');

            logger.info('Calling aiClient.chat...');
            const response = await this.aiClient.chat(question, this.conversationHistory);
            logger.info('Got response from aiClient, length:', response.length);

            this.conversationHistory.push({ role: 'assistant', content: response });

            // Limit conversation history to prevent token overflow
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-20);
            }

            return response;
        } catch (error) {
            logger.error('Error in ChatProvider.askQuestion:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return `Error: ${errorMessage}`;
        }
    }

    async askQuestionStream(question: string, onChunk: (chunk: string) => void): Promise<string> {
        const sessionId = `chat_stream_${Date.now()}`;
        logger.startTimer(sessionId);

        try {
            logger.chatUserInput(question, { sessionId, streaming: true });

            // Add user question to history
            this.conversationHistory.push({ role: 'user', content: question });
            logger.chatDebug('Added user message to conversation history', {
                historyLength: this.conversationHistory.length
            }, sessionId);

            // Get current workspace context
            const workspaceContext = await this.getWorkspaceContext();
            logger.chatDebug('Workspace context collected', {
                contextLength: workspaceContext.length
            }, sessionId);

            // 优先使用 Agent 系统处理流式请求
            if (this.agentSystem) {
                logger.chatDebug('Routing to Agent system (streaming)', {}, sessionId);
                const response = await this.handleAgentRequestStream(question, workspaceContext, sessionId, onChunk);
                logger.endTimer(sessionId, 'AgentStreamRequest');
                return response;
            }

            // 如果没有 Agent 系统，尝试工具调用
            if (this.toolSystem) {
                logger.chatDebug('Routing to Tool system (streaming)', {}, sessionId);
                const response = await this.handleToolRequestStream(question, workspaceContext, sessionId, onChunk);
                logger.endTimer(sessionId, 'ToolStreamRequest');
                return response;
            }

            // 最后才是普通流式聊天
            logger.chatDebug('Routing to AI chat (streaming)', {}, sessionId);
            logger.ai('Calling AI client for streaming chat', {
                question: question.substring(0, 50),
                historyLength: this.conversationHistory.length
            }, sessionId);

            const response = await this.aiClient.chatStream(question, this.conversationHistory, onChunk);

            logger.chatAIResponse(response, { sessionId, streaming: true });
            this.conversationHistory.push({ role: 'assistant', content: response });

            // Limit conversation history to prevent token overflow
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-20);
            }

            logger.endTimer(sessionId, 'AIStreamChat');
            return response;
        } catch (error) {
            logger.error('Error in ChatProvider.askQuestionStream:', error, { sessionId });
            logger.endTimer(sessionId, 'StreamError');
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Error: ${errorMessage}`);
        }
    }

    async explainCode(code: string): Promise<string> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            const language = activeEditor?.document.languageId || 'unknown';

            const prompt = promptManager.getExplainCodePrompt(code, language);

            const response = await this.aiClient.chat(prompt);
            return response;
        } catch (error) {
            console.error('Error in explainCode:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return `Error: ${errorMessage}`;
        }
    }

    async generateCode(prompt: string, language: string): Promise<string> {
        try {
            const fullPrompt = promptManager.getGenerateCodePrompt(prompt, language);

            const response = await this.aiClient.chat(fullPrompt);

            // Extract code from response if it's wrapped in markdown
            const codeMatch = response.match(/```[\w]*\n([\s\S]*?)\n```/);
            if (codeMatch) {
                return codeMatch[1];
            }

            return response;
        } catch (error) {
            console.error('Error in generateCode:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return `// Error: ${errorMessage}`;
        }
    }

    async suggestFix(error: string, code: string): Promise<string> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            const language = activeEditor?.document.languageId || 'unknown';

            const prompt = `I'm getting the following error in my ${language} code:

Error: ${error}

Code:
\`\`\`${language}
${code}
\`\`\`

Please suggest a fix for this error. Provide the corrected code and explain what was wrong.`;

            const response = await this.aiClient.chat(prompt);
            return response;
        } catch (error) {
            console.error('Error in suggestFix:', error);
            return 'Sorry, I encountered an error while suggesting a fix. Please try again.';
        }
    }

    async optimizeCode(code: string): Promise<string> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            const language = activeEditor?.document.languageId || 'unknown';

            const prompt = `Please optimize the following ${language} code for better performance, readability, and maintainability:

\`\`\`${language}
${code}
\`\`\`

Provide the optimized code along with explanations of the improvements made.`;

            const response = await this.aiClient.chat(prompt);
            return response;
        } catch (error) {
            console.error('Error in optimizeCode:', error);
            return 'Sorry, I encountered an error while optimizing the code. Please try again.';
        }
    }



    private async getWorkspaceContext(): Promise<string> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                return 'No active file';
            }

            const document = activeEditor.document;
            const language = document.languageId;
            const fileName = document.fileName;
            const lineCount = document.lineCount;

            // Get current selection or cursor position
            const selection = activeEditor.selection;
            const currentLine = selection.active.line + 1;

            // Get a snippet of the current file (around cursor position)
            const startLine = Math.max(0, currentLine - 10);
            const endLine = Math.min(lineCount, currentLine + 10);
            const snippet = document.getText(new vscode.Range(startLine, 0, endLine, 0));

            return `File: ${fileName}
Language: ${language}
Current line: ${currentLine}
Total lines: ${lineCount}

Code snippet around cursor:
\`\`\`${language}
${snippet}
\`\`\``;
        } catch (error) {
            console.error('Error getting workspace context:', error);
            return 'Unable to get workspace context';
        }
    }

    clearHistory(): void {
        this.conversationHistory = [];
    }

    getHistory(): Array<{role: 'user' | 'assistant', content: string}> {
        return [...this.conversationHistory];
    }

    /**
     * 设置工具系统
     */
    setToolSystem(toolSystem: ToolSystem): void {
        this.toolSystem = toolSystem;
    }

    /**
     * 设置 Agent 系统
     */
    setAgentSystem(agentSystem: AgentSystem): void {
        this.agentSystem = agentSystem;
    }



    /**
     * 处理 Agent 工作流请求 - 流式版本
     */
    private async handleAgentRequestStream(question: string, workspaceContext: string, sessionId: string, onChunk: (chunk: string) => void): Promise<string> {
        try {
            logger.chat('Handling agent workflow request (streaming)', {
                question: question.substring(0, 100),
                contextLength: workspaceContext.length
            }, sessionId);

            let responseContent = '';

            // 创建流式回调包装器 - 实时显示执行过程
            const streamingCallbacks: AgentCallbacks = {
                onTaskStarted: (task) => {
                    const startMsg = `🚀 **开始任务**: ${task.description}\n\n`;
                    responseContent += startMsg;
                    onChunk(startMsg);
                    logger.agentTaskStart(task.id, task.description, { sessionId });
                },

                onPlanCreated: (plan) => {
                    const planMsg = `📋 **执行计划**:\n${plan.steps.map((step, i) => `${i + 1}. ${step.description}`).join('\n')}\n\n`;
                    responseContent += planMsg;
                    onChunk(planMsg);
                    logger.agentDebug('Plan created', { stepsCount: plan.steps.length }, sessionId);
                },

                onStepStarted: (step) => {
                    const stepMsg = `⚡ **执行步骤**: ${step.description}\n`;
                    responseContent += stepMsg;
                    onChunk(stepMsg);
                    logger.agentStep(sessionId, step.id, step.description);
                },

                onStepCompleted: (step, result) => {
                    const resultMsg = result.success
                        ? `✅ **步骤完成**: ${step.description}\n`
                        : `❌ **步骤失败**: ${step.description} - ${result.error}\n`;
                    responseContent += resultMsg;
                    onChunk(resultMsg);
                    logger.agentStep(sessionId, step.id, `completed: ${result.success}`, { result: result.success });
                },

                onProgress: (progress, message) => {
                    const progressMsg = `📊 **进度**: ${progress.toFixed(1)}% - ${message}\n`;
                    responseContent += progressMsg;
                    onChunk(progressMsg);
                    logger.performance(`Agent progress: ${progress}%`, { progress, message }, sessionId);
                },

                onTaskCompleted: (task, reflection) => {
                    const completionMsg = `\n🎉 **任务完成**!\n\n`;
                    responseContent += completionMsg;
                    onChunk(completionMsg);
                    logger.agentTaskEnd(task.id, reflection.success, { sessionId });
                },

                onTaskFailed: (task, error) => {
                    const errorMsg = `\n❌ **任务失败**: ${error}\n\n`;
                    responseContent += errorMsg;
                    onChunk(errorMsg);
                    logger.agentTaskEnd(task.id, false, { error, sessionId });
                }
            };

            // 使用 Agent 系统处理请求
            const result = await this.agentSystem!.processRequest(question, streamingCallbacks);

            // 如果没有通过消息流生成内容，使用默认结果并发送
            if (!responseContent && result) {
                responseContent = result;
                onChunk(result);
            }

            // 添加到历史记录
            this.conversationHistory.push({ role: 'assistant', content: responseContent || result });

            return responseContent || result;
        } catch (error) {
            logger.error('Error handling agent request (streaming):', error, { sessionId });
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorResponse = `Agent 工作流执行出错: ${errorMessage}`;
            onChunk(errorResponse);
            return errorResponse;
        }
    }

    /**
     * 处理 Agent 工作流请求 - 使用新的消息流架构
     */
    private async handleAgentRequest(question: string, workspaceContext: string, sessionId: string): Promise<string> {
        try {
            logger.chat('Handling agent workflow request', {
                question: question.substring(0, 100),
                contextLength: workspaceContext.length
            }, sessionId);

            let responseContent = '';

            // 使用新的消息流回调
            const callbacks: AgentCallbacks = {
                // 新的消息流回调
                onMessage: (message: AgentMessage) => {
                    const formattedMessage = this.messageFormatter.formatMessage(message);
                    responseContent += formattedMessage;
                    logger.debug(`Agent message: ${message.type} - ${message.content}`);
                },

                onComplete: (result: string) => {
                    logger.info('Agent task completed');
                },

                onError: (error: string) => {
                    responseContent += `❌ **错误**: ${error}\n`;
                    logger.error('Agent error:', error);
                },

                // 保持传统回调以支持现有的 Agent 实现
                onTaskStarted: (task) => {
                    logger.info(`Agent 开始任务: ${task.description}`);
                },

                onTaskCompleted: (task, reflection) => {
                    logger.info(`Agent 完成任务: ${task.id}, 成功: ${reflection.success}`);
                },

                onTaskFailed: (task, error) => {
                    logger.error(`Agent 任务失败: ${task.id}, 错误: ${error}`);
                },

                onStepStarted: (step) => {
                    logger.debug(`执行步骤: ${step.description}`);
                },

                onStepCompleted: (step, result) => {
                    logger.debug(`步骤完成: ${step.id}, 成功: ${result.success}`);
                },

                onProgress: (progress, message) => {
                    logger.info(`进度: ${progress.toFixed(1)}% - ${message}`);
                }
            };

            // 使用 Agent 系统处理请求
            const result = await this.agentSystem!.processRequest(question, callbacks);

            // 如果没有通过消息流生成内容，使用默认结果
            const finalResponse = responseContent || result;

            // 添加到历史记录
            this.conversationHistory.push({ role: 'assistant', content: finalResponse });

            return finalResponse;
        } catch (error) {
            logger.error('Error handling agent request:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return `Agent 工作流执行出错: ${errorMessage}`;
        }
    }



    /**
     * 处理工具请求 - 流式版本
     */
    private async handleToolRequestStream(question: string, workspaceContext: string, sessionId: string, onChunk: (chunk: string) => void): Promise<string> {
        try {
            logger.chat('Handling tool request (streaming)', {
                question: question.substring(0, 100)
            }, sessionId);

            // 构建包含工具定义的提示词
            const toolDefinitions = this.toolSystem!.getToolDefinitions();
            const systemPrompt = this.buildToolSystemPrompt(toolDefinitions, workspaceContext);

            // 准备消息历史，包含工具定义
            const messages = [
                { role: 'system' as const, content: systemPrompt },
                ...this.conversationHistory.slice(-10), // 保留最近10条对话
                { role: 'user' as const, content: question }
            ];

            // 调用 AI 获取工具调用（流式）
            const response = await this.aiClient.chatStream(question, messages, onChunk);

            // 尝试解析工具调用
            const toolCalls = this.parseToolCalls(response);

            if (toolCalls.length > 0) {
                logger.chatDebug('Tool calls detected', { toolCallsCount: toolCalls.length }, sessionId);

                // 执行工具调用
                const toolResults = await this.executeToolCalls(toolCalls);

                // 生成最终响应
                const finalResponse = await this.generateToolResponse(question, toolCalls, toolResults);

                // 发送工具执行结果
                onChunk('\n\n' + finalResponse);

                // 添加到历史记录
                this.conversationHistory.push({ role: 'assistant', content: response + '\n\n' + finalResponse });

                return response + '\n\n' + finalResponse;
            } else {
                // 没有工具调用，返回普通响应
                this.conversationHistory.push({ role: 'assistant', content: response });
                return response;
            }
        } catch (error) {
            logger.error('Error handling tool request (streaming):', error, { sessionId });
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorResponse = `工具执行出错: ${errorMessage}`;
            onChunk(errorResponse);
            return errorResponse;
        }
    }

    /**
     * 处理工具请求
     */
    private async handleToolRequest(question: string, workspaceContext: string): Promise<string> {
        try {
            logger.info('Handling tool request:', question);

            // 构建包含工具定义的提示词
            const toolDefinitions = this.toolSystem!.getToolDefinitions();
            const systemPrompt = this.buildToolSystemPrompt(toolDefinitions, workspaceContext);

            // 准备消息历史，包含工具定义
            const messages = [
                { role: 'system' as const, content: systemPrompt },
                ...this.conversationHistory.slice(-10), // 保留最近10条对话
                { role: 'user' as const, content: question }
            ];

            // 调用 AI 获取工具调用
            const response = await this.aiClient.chat(question, messages);

            // 尝试解析工具调用
            const toolCalls = this.parseToolCalls(response);

            if (toolCalls.length > 0) {
                // 执行工具调用
                const toolResults = await this.executeToolCalls(toolCalls);

                // 生成最终响应
                const finalResponse = await this.generateToolResponse(question, toolCalls, toolResults);

                // 添加到历史记录
                this.conversationHistory.push({ role: 'assistant', content: finalResponse });

                return finalResponse;
            } else {
                // 没有工具调用，返回普通响应
                this.conversationHistory.push({ role: 'assistant', content: response });
                return response;
            }
        } catch (error) {
            logger.error('Error handling tool request:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return `工具执行出错: ${errorMessage}`;
        }
    }

    /**
     * 构建工具系统提示词
     */
    private buildToolSystemPrompt(toolDefinitions: any[], workspaceContext: string): string {
        return `你是一个智能编程助手，可以使用以下工具来帮助用户：

可用工具:
${JSON.stringify(toolDefinitions, null, 2)}

当前工作区上下文:
${workspaceContext}

使用说明:
1. 当用户请求文件操作时，使用相应的工具
2. 工具调用格式: TOOL_CALL:工具名称:参数JSON
3. 例如: TOOL_CALL:read_file:{"path": "src/example.ts"}
4. 可以连续调用多个工具
5. 执行工具后，向用户报告结果

请根据用户的请求选择合适的工具并执行操作。`;
    }

    /**
     * 解析工具调用
     */
    private parseToolCalls(response: string): ToolCall[] {
        const toolCalls: ToolCall[] = [];
        const toolCallRegex = /TOOL_CALL:(\w+):(\{.*?\})/g;

        let match;
        while ((match = toolCallRegex.exec(response)) !== null) {
            try {
                const toolName = match[1];
                const args = JSON.parse(match[2]);
                toolCalls.push({ name: toolName, arguments: args });
            } catch (error) {
                logger.warn('Failed to parse tool call:', match[0], error);
            }
        }

        return toolCalls;
    }

    /**
     * 执行工具调用
     */
    private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
        const results: ToolResult[] = [];

        for (const toolCall of toolCalls) {
            try {
                logger.info(`Executing tool: ${toolCall.name}`, toolCall.arguments);
                const result = await this.toolSystem!.executeTool(toolCall.name, toolCall.arguments);
                results.push(result);

                if (!result.success) {
                    logger.warn(`Tool execution failed: ${toolCall.name}`, result.error);
                }
            } catch (error) {
                logger.error(`Tool execution error: ${toolCall.name}`, error);
                results.push({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        return results;
    }

    /**
     * 生成工具响应
     */
    private async generateToolResponse(
        originalQuestion: string,
        toolCalls: ToolCall[],
        toolResults: ToolResult[]
    ): Promise<string> {
        const successfulResults = toolResults.filter(r => r.success);
        const failedResults = toolResults.filter(r => !r.success);

        let response = '';

        if (successfulResults.length > 0) {
            response += '✅ 操作成功完成:\n\n';

            for (let i = 0; i < toolCalls.length; i++) {
                const toolCall = toolCalls[i];
                const result = toolResults[i];

                if (result.success) {
                    response += `🔧 ${toolCall.name}:\n`;
                    response += `   ${result.message || '操作完成'}\n`;

                    if (result.data) {
                        if (toolCall.name === 'read_file' && result.data.content) {
                            response += `   文件内容:\n\`\`\`\n${result.data.content}\n\`\`\`\n`;
                        } else if (toolCall.name === 'list_files' && result.data.files) {
                            response += `   找到 ${result.data.files.length} 个文件:\n`;
                            result.data.files.slice(0, 10).forEach((file: any) => {
                                response += `   - ${file.name} (${file.isDirectory ? '目录' : '文件'})\n`;
                            });
                            if (result.data.files.length > 10) {
                                response += `   ... 还有 ${result.data.files.length - 10} 个文件\n`;
                            }
                        } else if (toolCall.name === 'search_in_files' && result.data.results) {
                            response += `   搜索结果 (${result.data.results.length} 个匹配):\n`;
                            result.data.results.slice(0, 5).forEach((match: any) => {
                                response += `   - ${match.path}:${match.line} - ${match.content.trim()}\n`;
                            });
                        }
                    }
                    response += '\n';
                }
            }
        }

        if (failedResults.length > 0) {
            response += '❌ 部分操作失败:\n\n';

            for (let i = 0; i < toolCalls.length; i++) {
                const toolCall = toolCalls[i];
                const result = toolResults[i];

                if (!result.success) {
                    response += `🔧 ${toolCall.name}: ${result.error}\n`;
                }
            }
            response += '\n';
        }

        return response.trim();
    }
}
