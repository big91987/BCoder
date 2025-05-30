import { IAgent, AgentConfig, AgentRequest, AgentResponse, AgentCallbacks, AgentMessage } from './agentInterface';
import { ToolSystem } from '../tools';
import { AIClient } from '../utils/aiClient';
import { logger } from '../utils/logger';

/**
 * BCoder 默认 Agent 实现
 * 基于 OPAR 循环的智能代码助手
 */
export class BCoderAgent implements IAgent {
    public readonly config: AgentConfig = {
        name: 'BCoder Agent',
        version: '1.0.0',
        description: 'BCoder 默认智能代码助手，基于 OPAR 循环执行任务',
        capabilities: [
            'file_operations',
            'code_analysis',
            'task_planning',
            'tool_execution',
            'workspace_management'
        ]
    };

    private toolSystem: ToolSystem | null = null;
    private aiClient: AIClient | null = null;
    private isInitialized = false;
    private maxIterations = 10;

    async initialize(context: any): Promise<void> {
        try {
            logger.info('🤖 Initializing BCoder Agent...');

            // 初始化工具系统和 AI 客户端
            this.toolSystem = context.toolSystem;
            this.aiClient = context.aiClient;

            if (!this.toolSystem) {
                throw new Error('ToolSystem is required for BCoder Agent');
            }

            if (!this.aiClient) {
                throw new Error('AIClient is required for BCoder Agent');
            }

            this.isInitialized = true;
            logger.info('✅ BCoder Agent initialized successfully');
        } catch (error) {
            logger.error('❌ Failed to initialize BCoder Agent:', error);
            throw error;
        }
    }

    async processRequest(request: AgentRequest, callbacks: AgentCallbacks): Promise<AgentResponse> {
        if (!this.isInitialized || !this.toolSystem || !this.aiClient) {
            throw new Error('Agent not initialized');
        }

        const startTime = Date.now();
        let stepsExecuted = 0;
        const toolsUsed: string[] = [];

        try {
            logger.info(`🚀 BCoder Agent processing request: ${request.message.substring(0, 50)}...`);

            // 不发送调试消息给前端，只记录到日志
            logger.info(`🚀 开始处理任务: ${request.message}`);

            // 实现 ReAct Agent Loop
            const result = await this.reactAgentLoop(request, callbacks);

            const executionTime = Date.now() - startTime;

            // 发送完成回调
            callbacks.onComplete(result);

            logger.info(`✅ BCoder Agent completed request in ${executionTime}ms`);

            return {
                success: true,
                result,
                metadata: {
                    executionTime,
                    stepsExecuted,
                    toolsUsed
                }
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            logger.error('❌ BCoder Agent request failed:', error);

            callbacks.onError(errorMessage);

            return {
                success: false,
                result: '',
                error: errorMessage,
                metadata: {
                    executionTime,
                    stepsExecuted,
                    toolsUsed
                }
            };
        }
    }

    /**
     * ReAct Agent Loop - 真正的 Agent 实现
     */
    private async reactAgentLoop(request: AgentRequest, callbacks: AgentCallbacks): Promise<string> {
        const conversation: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [];
        let iteration = 0;
        let finalAnswer = '';

        // 获取可用工具列表
        const availableTools = this.toolSystem!.getToolDefinitions();

        // 调试工具定义
        logger.info('=== TOOL DEFINITIONS DEBUG ===');
        logger.info(`Available tools count: ${availableTools.length}`);
        logger.info('Raw tool definitions:');
        logger.info(JSON.stringify(availableTools, null, 2));

        const toolDescriptions = availableTools.map((tool: any) => {
            // 工具定义格式：{ type: "function", function: { name: "...", description: "..." } }
            const name = tool.function?.name || tool.name || 'UNKNOWN_NAME';
            const description = tool.function?.description || tool.description || 'UNKNOWN_DESCRIPTION';
            return `- ${name}: ${description}`;
        }).join('\n');

        logger.info('Tool descriptions string:');
        logger.info(toolDescriptions);
        logger.info('=== END TOOL DEFINITIONS DEBUG ===');

        // 系统提示词
        const systemPrompt = `你是一个智能代码助手。你可以使用以下工具来帮助用户：

${toolDescriptions}

请使用 ReAct 模式回答用户问题：
1. Thought: 分析问题，思考需要做什么
2. Action: 选择要使用的工具和参数
3. Observation: 观察工具执行结果
4. 重复上述步骤直到能够回答用户问题
5. Final Answer: 给出最终答案

格式示例：
Thought: 我需要读取文件来了解内容
Action: read_file
Action Input: {"path": "package.json"}
Observation: [工具执行结果]
Thought: 现在我了解了文件内容，可以回答用户问题
Final Answer: 这个文件是...

用户问题: ${request.message}`;

        // 调试系统提示词
        logger.info('=== SYSTEM PROMPT DEBUG ===');
        logger.info('System prompt length:', systemPrompt.length);
        logger.info('System prompt content:');
        logger.info(systemPrompt);
        logger.info('=== END SYSTEM PROMPT DEBUG ===');

        // 只记录到日志，不显示给用户
        logger.info('🤔 开始分析问题...');

        while (iteration < this.maxIterations) {
            iteration++;

            try {
                // 构建对话历史 - 过滤掉 undefined
                const validConversation = conversation.filter(msg => msg && msg.role && msg.content);
                const messages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [
                    { role: 'system', content: systemPrompt },
                    ...validConversation,
                    { role: 'user', content: iteration === 1 ? request.message : '请继续' }
                ];

                // 调试：检查消息数组
                logger.info('=== MESSAGE VALIDATION ===');
                logger.info(`Conversation length: ${conversation.length}`);
                logger.info(`Valid conversation length: ${validConversation.length}`);
                logger.info(`Final messages length: ${messages.length}`);
                messages.forEach((msg, idx) => {
                    logger.info(`Message ${idx}: role=${msg.role}, content=${msg.content ? 'exists' : 'MISSING'}`);
                });
                logger.info('=== END MESSAGE VALIDATION ===');

                // 只记录到日志，不显示给用户
                logger.info(`💭 第 ${iteration} 轮思考中...`);

                // 打印 LLM 原始输入
                logger.info('=== RAW LLM INPUT ===');
                logger.info(`Iteration: ${iteration}`);
                logger.info('RAW MESSAGES ARRAY:');
                logger.info(JSON.stringify(messages, null, 2));
                logger.info('=== END RAW LLM INPUT ===');

                // 准备 AIClient 参数
                const currentMessage = messages[messages.length - 1].content;
                const historyMessages = messages.slice(0, -1) as Array<{role: 'system' | 'user' | 'assistant', content: string}>;

                logger.info('=== AICLIENT CALL PARAMS ===');
                logger.info('CURRENT MESSAGE:');
                logger.info(currentMessage);
                logger.info('HISTORY MESSAGES:');
                logger.info(JSON.stringify(historyMessages, null, 2));
                logger.info('=== END AICLIENT CALL PARAMS ===');

                const response = await this.aiClient!.chat(currentMessage, historyMessages);

                // 打印 LLM 原始输出
                logger.info('=== RAW LLM OUTPUT ===');
                logger.info('RAW RESPONSE STRING:');
                logger.info(response);
                logger.info('=== END RAW LLM OUTPUT ===');

                conversation.push({ role: 'assistant' as const, content: response });

                // 解析 LLM 响应
                const parseResult = this.parseAgentResponse(response);

                // 打印解析结果
                logger.info('=== PARSE RESULT ===');
                logger.info(`Thought: ${parseResult.thought || 'None'}`);
                logger.info(`Action: ${parseResult.action || 'None'}`);
                logger.info(`Action Input: ${JSON.stringify(parseResult.actionInput) || 'None'}`);
                logger.info(`Final Answer: ${parseResult.finalAnswer || 'None'}`);
                logger.info('=== END PARSE RESULT ===');

                if (parseResult.thought) {
                    // 只记录到日志，不显示给用户
                    logger.info(`💭 思考: ${parseResult.thought}`);
                }

                if (parseResult.action && parseResult.actionInput) {
                    // 执行工具
                    logger.info('=== TOOL EXECUTION ===');
                    logger.info(`Tool Name: ${parseResult.action}`);
                    logger.info(`Tool Input: ${JSON.stringify(parseResult.actionInput, null, 2)}`);

                    // 显示有意义的用户消息
                    const actionMessage = this.getActionMessage(parseResult.action, parseResult.actionInput);
                    callbacks.onMessage({
                        type: 'step_start',
                        content: actionMessage,
                        data: { action: parseResult.action, input: parseResult.actionInput },
                        timestamp: new Date()
                    });

                    const toolResult = await this.toolSystem!.executeTool(
                        parseResult.action,
                        parseResult.actionInput
                    );

                    logger.info(`Tool Success: ${toolResult.success}`);
                    logger.info(`Tool Result: ${JSON.stringify(toolResult.data, null, 2)}`);
                    if (!toolResult.success) {
                        logger.info(`Tool Error: ${toolResult.error}`);
                    }
                    logger.info('=== END TOOL EXECUTION ===');

                    const observation = toolResult.success
                        ? `工具执行成功: ${JSON.stringify(toolResult.data)}`
                        : `工具执行失败: ${toolResult.error}`;

                    conversation.push({ role: 'user' as const, content: `Observation: ${observation}` });

                    // 显示有意义的完成消息
                    const completeMessage = this.getCompleteMessage(parseResult.action, toolResult, parseResult.actionInput);
                    callbacks.onMessage({
                        type: 'step_complete',
                        content: completeMessage,
                        data: { success: toolResult.success, result: toolResult.data },
                        timestamp: new Date()
                    });
                }

                if (parseResult.finalAnswer) {
                    finalAnswer = parseResult.finalAnswer;
                    // 不显示"任务完成"，直接显示最终答案
                    break;
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                callbacks.onMessage({
                    type: 'error',
                    content: `❌ 第 ${iteration} 轮执行失败: ${errorMessage}`,
                    timestamp: new Date()
                });
                break;
            }
        }

        if (!finalAnswer && iteration >= this.maxIterations) {
            finalAnswer = '抱歉，在最大迭代次数内未能完成任务。';
            callbacks.onMessage({
                type: 'error',
                content: '⚠️ 达到最大迭代次数',
                timestamp: new Date()
            });
        }

        return finalAnswer || '任务执行完成，但未获得明确答案。';
    }

    /**
     * 获取用户友好的操作消息
     */
    private getActionMessage(action: string, actionInput: any): string {
        switch (action) {
            case 'read_file':
                return `📖 正在读取文件: ${actionInput.path}`;
            case 'write_file':
                return `✏️ 正在写入文件: ${actionInput.path}`;
            case 'edit_file':
                return `✏️ 正在编辑文件: ${actionInput.path}`;
            case 'list_files':
                return `📁 正在列出目录内容: ${actionInput.path || '.'}`;
            case 'search_files':
                return `🔍 正在搜索文件: ${actionInput.pattern}`;
            case 'search_in_files':
                return `🔍 正在搜索文件内容: ${actionInput.query}`;
            case 'get_file_info':
                return `ℹ️ 正在获取文件信息: ${actionInput.path}`;
            case 'create_directory':
                return `📁 正在创建目录: ${actionInput.path}`;
            case 'move_file':
                return `📦 正在移动文件: ${actionInput.source} → ${actionInput.destination}`;
            case 'delete_file':
                return `🗑️ 正在删除: ${actionInput.path}`;
            default:
                return `⚡ 正在执行: ${action}`;
        }
    }

    /**
     * 获取用户友好的完成消息
     */
    private getCompleteMessage(action: string, toolResult: any, actionInput: any): string {
        if (!toolResult.success) {
            return `❌ 操作失败: ${toolResult.error}`;
        }

        switch (action) {
            case 'read_file':
                return `✅ 已读取文件: ${actionInput.path}`;
            case 'write_file':
                return `✅ 已写入文件: ${actionInput.path}`;
            case 'edit_file':
                return `✅ 已编辑文件: ${actionInput.path}`;
            case 'list_files':
                const fileCount = Array.isArray(toolResult.data?.files) ? toolResult.data.files.length : 0;
                return `✅ 找到 ${fileCount} 个文件/目录`;
            case 'search_files':
                const searchCount = Array.isArray(toolResult.data) ? toolResult.data.length : 0;
                return `✅ 搜索完成，找到 ${searchCount} 个匹配文件`;
            case 'search_in_files':
                const matchCount = toolResult.data?.matches?.length || 0;
                return `✅ 搜索完成，找到 ${matchCount} 个匹配项`;
            case 'get_file_info':
                return `✅ 已获取文件信息: ${actionInput.path}`;
            case 'create_directory':
                return `✅ 已创建目录: ${actionInput.path}`;
            case 'move_file':
                return `✅ 已移动文件: ${actionInput.source} → ${actionInput.destination}`;
            case 'delete_file':
                return `✅ 已删除: ${actionInput.path}`;
            default:
                return `✅ 操作完成: ${action}`;
        }
    }

    /**
     * 解析 Agent 响应
     */
    private parseAgentResponse(response: string): {
        thought?: string;
        action?: string;
        actionInput?: any;
        finalAnswer?: string;
    } {
        const result: any = {};

        // 解析 Thought
        const thoughtMatch = response.match(/Thought:\s*(.+?)(?=\n(?:Action|Final Answer)|$)/s);
        if (thoughtMatch) {
            result.thought = thoughtMatch[1].trim();
        }

        // 解析 Action
        const actionMatch = response.match(/Action:\s*(.+?)(?=\n|$)/);
        if (actionMatch) {
            result.action = actionMatch[1].trim();
        }

        // 解析 Action Input
        const actionInputMatch = response.match(/Action Input:\s*(.+?)(?=\n(?:Observation|Thought|Final Answer)|$)/s);
        if (actionInputMatch) {
            try {
                result.actionInput = JSON.parse(actionInputMatch[1].trim());
            } catch {
                result.actionInput = { query: actionInputMatch[1].trim() };
            }
        }

        // 解析 Final Answer
        const finalAnswerMatch = response.match(/Final Answer:\s*(.+?)$/s);
        if (finalAnswerMatch) {
            result.finalAnswer = finalAnswerMatch[1].trim();
        }

        return result;
    }

    async stop(): Promise<void> {
        // AgentSystem 没有 stop 方法，这里只是标记
        logger.info('🛑 BCoder Agent stopped');
    }

    async dispose(): Promise<void> {
        this.toolSystem = null;
        this.aiClient = null;
        this.isInitialized = false;
        logger.info('🗑️ BCoder Agent disposed');
    }

    getStatus() {
        return {
            isActive: this.isInitialized,
            currentTask: undefined,
            progress: 0
        };
    }
}
