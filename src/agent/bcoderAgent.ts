import { IAgent, AgentConfig, AgentRequest, AgentResponse, AgentCallbacks } from './agentInterface';
import { ToolSystem } from '../tools';
import { AIClient } from '../utils/aiClient';
import { logger } from '../utils/logger';
import { StandardMessage, MessageRole, MessageType, MessageFactory, MessageBuilder } from '../types/message';


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
        // 使用传入的对话历史，如果没有则创建新的
        const conversation: Array<{role: 'system' | 'user' | 'assistant', content: string}> =
            request.conversationHistory ? [...request.conversationHistory] : [];
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
            // 工具定义格式：{ type: "function", function: { name: "...", description: "...", parameters: {...} } }
            const name = tool.function?.name || tool.name || 'UNKNOWN_NAME';
            const description = tool.function?.description || tool.description || 'UNKNOWN_DESCRIPTION';
            const parameters = tool.function?.parameters || {};

            // 构建参数描述
            let paramDesc = '';
            if (parameters.properties) {
                const paramList = Object.entries(parameters.properties).map(([paramName, paramInfo]: [string, any]) => {
                    const required = parameters.required?.includes(paramName) ? ' (必需)' : ' (可选)';
                    return `    - ${paramName}: ${paramInfo.description}${required}`;
                }).join('\n');
                paramDesc = `\n  参数:\n${paramList}`;
            }

            return `- ${name}: ${description}${paramDesc}`;
        }).join('\n');

        logger.info('Tool descriptions string:');
        logger.info(toolDescriptions);
        logger.info('=== END TOOL DEFINITIONS DEBUG ===');

        // 系统提示词 - 使用结构化格式，支持流式输出
        const systemPrompt = `你是一个智能代码助手。你可以使用以下工具来帮助用户：

${toolDescriptions}

请严格按照以下格式输出，不要使用JSON格式：

如果需要使用工具：
THOUGHT: [详细的分析和思考过程]
ACTION: [工具名称]
ACTION_INPUT: [JSON格式的工具参数]

如果可以直接回答：
THOUGHT: [基于已有信息的分析]
FINAL_ANSWER: [完整的最终答案，可以多行]

重要规则：
1. 每个字段必须独占一行，以字段名开头
2. FINAL_ANSWER 可以包含多行内容
3. 不要使用JSON格式或其他格式
4. 严格按照上述格式，不要添加额外的标记
5. 记住之前的对话内容，保持上下文连贯性

示例：
THOUGHT: 用户询问我的身份，我可以直接回答，不需要使用任何工具
FINAL_ANSWER: 我是一个智能代码助手，可以帮助你处理与文件操作相关的任务，如读取、写入、编辑文件等。`;

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

                // 暂时回退到非流式模式，确保基本功能正常
                logger.info('🔄 Processing with structured format...');

                // 使用流式调用 LLM
                logger.info('🌊 开始流式调用 LLM...');

                let fullResponse = '';
                let currentThought = '';
                let currentFinalAnswer = '';
                let hasStartedFinalAnswer = false;

                // 🔧 使用对象来确保引用传递
                const streamState = {
                    currentFinalAnswer: '',
                    hasStartedFinalAnswer: false
                };
                let hasAction = false;
                let actionName = '';
                let actionInput: any = null;

                let hasShownThought = false;
                let chunkCount = 0;

                await this.aiClient!.chatStream(currentMessage, historyMessages, (chunk: string) => {
                    chunkCount++;
                    fullResponse += chunk;

                    // 实时解析流式内容
                    const parseResult = this.parseStreamingResponse(fullResponse);

                    // 处理思考内容 - 当检测到 FINAL_ANSWER 开始时，显示完整思考
                    if (parseResult.thought && !hasShownThought && fullResponse.includes('FINAL_ANSWER:')) {
                        callbacks.onMessage(MessageFactory.thinking(parseResult.thought));
                        currentThought = parseResult.thought;
                        hasShownThought = true;
                    }

                    // 处理最终答案内容 - 流式显示
                    if (parseResult.finalAnswer) {
                        if (!streamState.hasStartedFinalAnswer) {
                            try {
                                callbacks.onMessage(MessageFactory.streamingStart(''));
                                streamState.hasStartedFinalAnswer = true;
                                streamState.currentFinalAnswer = ''; // 从空开始，确保第一次能发送完整内容
                            } catch (error) {
                                logger.error(`❌ 流式初始化失败: ${error}`);
                                streamState.hasStartedFinalAnswer = true; // 防止重复尝试
                            }
                        }

                        // 只有当新内容更长时才处理增量
                        if (parseResult.finalAnswer.length > streamState.currentFinalAnswer.length) {
                            const newAnswer = parseResult.finalAnswer.substring(streamState.currentFinalAnswer.length);
                            if (newAnswer) {
                                callbacks.onMessage(MessageFactory.streamingDelta(newAnswer));
                                streamState.currentFinalAnswer = parseResult.finalAnswer;
                            }
                        }

                        // 同步到外部变量
                        currentFinalAnswer = streamState.currentFinalAnswer;
                        hasStartedFinalAnswer = streamState.hasStartedFinalAnswer;
                    }

                    // 检查是否有工具调用
                    if (parseResult.action) {
                        actionName = parseResult.action;
                        // 🔧 修复：只有当actionInput不为null时才设置hasAction为true
                        if (parseResult.actionInput !== null && parseResult.actionInput !== undefined) {
                            actionInput = parseResult.actionInput;
                            hasAction = true;
                        } else {
                            // 如果actionInput还没有解析成功，保持hasAction为false
                            hasAction = false;
                        }
                    }
                });

                conversation.push({ role: 'assistant' as const, content: fullResponse });

                logger.info(`🎯 流式处理完成 - 思考: ${!!currentThought}, 工具: ${actionName || 'None'}, 答案: ${!!currentFinalAnswer}`);



                // 如果有工具需要执行
                if (hasAction && actionName && actionInput) {
                    logger.info('✅ 工具执行条件满足，开始执行工具');
                    await this.executeToolAndContinue(actionName, actionInput, conversation, callbacks);
                    // 工具执行后继续下一轮循环
                    continue;
                } else {
                    logger.warn(`❌ 工具执行条件不满足: hasAction=${hasAction}, actionName="${actionName}", actionInput=${JSON.stringify(actionInput)}`);
                }

                // 如果有最终答案，结束循环
                if (currentFinalAnswer) {
                    if (hasStartedFinalAnswer) {
                        callbacks.onMessage(MessageFactory.streamingComplete());
                    }
                    finalAnswer = currentFinalAnswer;
                    break; // 明确终止循环
                }

                // 如果既没有工具也没有最终答案，说明有 bug，直接报错
                if (!hasAction && !currentFinalAnswer) {
                    const errorMsg = `❌ 流式解析失败：hasAction=${hasAction}, currentFinalAnswer="${currentFinalAnswer}", fullResponse="${fullResponse}"`;
                    logger.error(errorMsg);
                    callbacks.onMessage(MessageFactory.error(errorMsg));
                    throw new Error('流式解析失败，请检查 LLM 响应格式或解析逻辑');
                }



            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error(`💥 第 ${iteration} 轮执行出现异常: ${errorMessage}`);
                logger.error(`Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`);

                const errorMsg = MessageFactory.error(
                    `❌ 第 ${iteration} 轮执行失败: ${errorMessage}`
                );

                // 调试日志
                logger.info(`[msg][error] ❌ 第 ${iteration} 轮执行失败: ${errorMessage}`);
                logger.debug(`[msg][error] metadata: ${JSON.stringify(errorMsg.metadata)}`);

                callbacks.onMessage(errorMsg);
                break;
            }

            // 调试：循环结束检查
            logger.info(`🔚 第 ${iteration} 轮循环结束，继续下一轮...`);
        }

        // 调试：循环完全结束
        logger.info(`🏁 ReAct 循环完全结束，总共执行了 ${iteration} 轮，finalAnswer: ${!!finalAnswer}`);

        if (!finalAnswer && iteration >= this.maxIterations) {
            finalAnswer = '抱歉，在最大迭代次数内未能完成任务。';
            const maxIterationMsg = MessageFactory.error('⚠️ 达到最大迭代次数');

            // 调试日志
            logger.info(`[msg][error] ⚠️ 达到最大迭代次数`);
            logger.debug(`[msg][error] metadata: ${JSON.stringify(maxIterationMsg.metadata)}`);

            callbacks.onMessage(maxIterationMsg);
        }

        const result = finalAnswer || '任务执行完成，但未获得明确答案。';
        logger.info(`📤 Agent 最终返回结果: ${result.substring(0, 100)}${result.length > 100 ? '...' : ''}`);
        return result;
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

        // 获取路径参数，支持多种参数名
        const getPath = () => actionInput.path || actionInput.file_path || actionInput.filePath || '';

        switch (action) {
            case 'read_file':
                return `✅ 已读取文件: ${getPath()}`;
            case 'write_file':
                return `✅ 已写入文件: ${getPath()}`;
            case 'edit_file':
                return `✅ 已编辑文件: ${getPath()}`;
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
                return `✅ 已获取文件信息: ${getPath()}`;
            case 'create_directory':
                return `✅ 已创建目录: ${getPath()}`;
            case 'move_file':
                return `✅ 已移动文件: ${actionInput.source || actionInput.from || ''} → ${actionInput.destination || actionInput.to || ''}`;
            case 'delete_file':
                return `✅ 已删除: ${getPath()}`;
            default:
                return `✅ 操作完成: ${action}`;
        }
    }





    /**
     * 解析流式响应（实时解析，支持单行和多行格式）
     */
    private parseStreamingResponse(partialResponse: string): {
        thought?: string;
        action?: string;
        actionInput?: any;
        finalAnswer?: string;
    } {
        const result: any = {};

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

        // 保留关键调试信息
        if (partialResponse.includes('FINAL_ANSWER:') && result.finalAnswer) {
            logger.debug(`📝 解析到最终答案 (长度: ${result.finalAnswer.length})`);
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



    /**
     * 执行工具并继续对话
     */
    private async executeToolAndContinue(
        action: string,
        actionInput: any,
        conversation: Array<{role: 'system' | 'user' | 'assistant', content: string}>,
        callbacks: AgentCallbacks
    ): Promise<void> {
        logger.info('=== TOOL EXECUTION ===');
        logger.info(`Tool Name: ${action}`);
        logger.info(`Tool Input: ${JSON.stringify(actionInput, null, 2)}`);

        // 发送工具开始消息
        const actionMessage = this.getActionMessage(action, actionInput);
        const toolStartMsg = MessageFactory.toolMessage(action, actionMessage);
        callbacks.onMessage(toolStartMsg);

        // 执行工具
        const toolResult = await this.toolSystem!.executeTool(action, actionInput);

        logger.info(`Tool Success: ${toolResult.success}`);
        logger.info(`Tool Result: ${JSON.stringify(toolResult.data, null, 2)}`);
        if (!toolResult.success) {
            logger.info(`Tool Error: ${toolResult.error}`);
        }
        logger.info('=== END TOOL EXECUTION ===');

        // 添加观察结果到对话历史
        const observation = toolResult.success
            ? `工具执行成功: ${JSON.stringify(toolResult.data)}`
            : `工具执行失败: ${toolResult.error}`;

        conversation.push({ role: 'user' as const, content: `Observation: ${observation}` });

        // 发送工具完成消息
        const completeMessage = this.getCompleteMessage(action, toolResult, actionInput);
        const toolCompleteMsg = MessageFactory.toolMessage(
            action,
            completeMessage,
            toolResult.success,
            toolResult.data
        );
        callbacks.onMessage(toolCompleteMsg);
    }


}
