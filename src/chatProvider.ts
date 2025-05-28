import * as vscode from 'vscode';
import { AIClient } from './utils/aiClient';
import { promptManager } from './utils/promptManager';
import { logger } from './utils/logger';
import { ToolSystem } from './tools';
import { ToolCall, ToolResult } from './tools/types';
import { AgentSystem, AgentCallbacks } from './agent';

export class ChatProvider {
    private aiClient: AIClient;
    private conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [];
    private toolSystem: ToolSystem | null = null;
    private agentSystem: AgentSystem | null = null;

    constructor(aiClient: AIClient, toolSystem?: ToolSystem, agentSystem?: AgentSystem) {
        this.aiClient = aiClient;
        this.toolSystem = toolSystem || null;
        this.agentSystem = agentSystem || null;
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

            // Check if this is an agent workflow request
            if (this.agentSystem && this.shouldUseAgent(question)) {
                return await this.handleAgentRequest(question, workspaceContext);
            }

            // Check if this is a tool-related request
            if (this.toolSystem && this.shouldUseTool(question)) {
                return await this.handleToolRequest(question, workspaceContext);
            }

            // Prepare the prompt with context using PromptManager
            const prompt = promptManager.getChatPrompt(question, workspaceContext);
            logger.info('Generated prompt using PromptManager');

            // Get AI response - pass the user question directly, not the full prompt
            logger.info('Calling aiClient.chat...');
            const response = await this.aiClient.chat(question, this.conversationHistory);
            logger.info('Got response from aiClient, length:', response.length);

            // Add assistant response to history
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
        try {
            logger.info('ChatProvider.askQuestionStream called with question:', question);

            // Add user question to history
            this.conversationHistory.push({ role: 'user', content: question });
            logger.info('Added question to conversation history');

            // Get current workspace context
            const workspaceContext = await this.getWorkspaceContext();
            logger.info('Got workspace context:', workspaceContext);

            // Get AI response with streaming
            logger.info('Calling aiClient.chatStream...');
            const response = await this.aiClient.chatStream(question, this.conversationHistory, onChunk);
            logger.info('Got complete response from aiClient, length:', response.length);

            // Add assistant response to history
            this.conversationHistory.push({ role: 'assistant', content: response });

            // Limit conversation history to prevent token overflow
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-20);
            }

            return response;
        } catch (error) {
            logger.error('Error in ChatProvider.askQuestionStream:', error);
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
     * 判断是否应该使用 Agent 工作流
     */
    private shouldUseAgent(question: string): boolean {
        const agentKeywords = [
            'implement', 'create', 'build', 'develop', 'refactor',
            'fix bug', 'add feature', 'optimize', 'improve',
            '实现', '创建', '构建', '开发', '重构',
            '修复', '添加功能', '优化', '改进',
            'task', 'project', 'workflow', 'automation',
            '任务', '项目', '工作流', '自动化'
        ];

        const question_lower = question.toLowerCase();
        return agentKeywords.some(keyword =>
            question_lower.includes(keyword.toLowerCase())
        ) || question.length > 50; // 长问题通常需要工作流处理
    }

    /**
     * 处理 Agent 工作流请求
     */
    private async handleAgentRequest(question: string, workspaceContext: string): Promise<string> {
        try {
            logger.info('Handling agent workflow request:', question);

            // 创建 Agent 回调
            const callbacks: AgentCallbacks = {
                onTaskStarted: (task) => {
                    logger.info(`🚀 Agent 开始任务: ${task.description}`);
                },

                onTaskCompleted: (task, reflection) => {
                    logger.info(`✅ Agent 完成任务: ${task.id}, 成功: ${reflection.success}`);
                },

                onTaskFailed: (task, error) => {
                    logger.error(`❌ Agent 任务失败: ${task.id}, 错误: ${error}`);
                },

                onStepStarted: (step) => {
                    logger.debug(`🔧 执行步骤: ${step.description}`);
                },

                onStepCompleted: (step, result) => {
                    logger.debug(`${result.success ? '✅' : '❌'} 步骤完成: ${step.id}`);
                },

                onProgress: (progress, message) => {
                    logger.info(`📊 进度: ${progress.toFixed(1)}% - ${message}`);
                }
            };

            // 使用 Agent 系统处理请求
            const result = await this.agentSystem!.processRequest(question, callbacks);

            // 添加到历史记录
            this.conversationHistory.push({ role: 'assistant', content: result });

            return result;
        } catch (error) {
            logger.error('Error handling agent request:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return `Agent 工作流执行出错: ${errorMessage}`;
        }
    }

    /**
     * 判断是否应该使用工具
     */
    private shouldUseTool(question: string): boolean {
        const toolKeywords = [
            'read file', 'write file', 'edit file', 'create file',
            'list files', 'search files', 'find files',
            'create directory', 'delete file', 'move file',
            '读取文件', '写入文件', '编辑文件', '创建文件',
            '列出文件', '搜索文件', '查找文件',
            '创建目录', '删除文件', '移动文件'
        ];

        return toolKeywords.some(keyword =>
            question.toLowerCase().includes(keyword.toLowerCase())
        );
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
