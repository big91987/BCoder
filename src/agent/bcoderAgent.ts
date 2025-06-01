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

        // 系统提示词
        const systemPrompt = `你是一个智能代码助手。你可以使用以下工具来帮助用户：

${toolDescriptions}

请使用 ReAct 模式回答用户问题，并以 JSON 格式输出。

工作流程：
1. 分析用户问题，思考需要什么信息
2. 如果需要更多信息，使用工具获取
3. 如果已有足够信息，直接给出最终答案

JSON 输出格式：
- 如果需要使用工具：
{
  "thought": "分析问题，说明为什么需要这个工具",
  "action": "工具名称",
  "action_input": {"参数名": "参数值"}
}

- 如果可以直接回答：
{
  "thought": "基于已有信息的分析",
  "final_answer": "完整的最终答案"
}

示例：
- 读取文件: {"action": "read_file", "action_input": {"path": "/path/to/file"}}
- 列出目录: {"action": "list_files", "action_input": {"path": "/path/to/directory"}}
- 搜索文件: {"action": "search_files", "action_input": {"pattern": "*.js"}}

重要：
- 必须输出有效的 JSON 格式
- 不要自己编造 Observation，等待真实的工具执行结果
- 收到工具结果后，判断是否需要更多信息还是可以回答
- 尽量用最少的工具调用完成任务

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

                const response = await this.aiClient!.chat(currentMessage, historyMessages, true);

                // 打印 LLM 原始输出
                logger.info('=== RAW LLM OUTPUT ===');
                logger.info('RAW RESPONSE STRING:');
                logger.info(response);
                logger.info('=== END RAW LLM OUTPUT ===');

                conversation.push({ role: 'assistant' as const, content: response });

                // 解析 LLM 响应 - 支持 JSON 格式
                const parseResult = this.parseAgentResponseJson(response);

                // 检查是否有解析错误
                if (parseResult.error) {
                    logger.error(`🚫 JSON 解析错误: ${parseResult.error}`);

                    // 发送错误消息给前端
                    const errorMsg = MessageFactory.error(
                        `❌ LLM 输出格式错误: ${parseResult.error}`
                    );

                    // 调试日志
                    logger.info(`[msg][error] ❌ LLM 输出格式错误: ${parseResult.error}`);
                    logger.debug(`[msg][error] metadata: ${JSON.stringify(errorMsg.metadata)}`);

                    callbacks.onMessage(errorMsg);
                    break; // 结束循环
                }

                // 打印解析结果
                logger.info('=== PARSE RESULT ===');
                logger.info(`Thought: ${parseResult.thought || 'None'}`);
                logger.info(`Action: ${parseResult.action || 'None'}`);
                logger.info(`Action Input: ${JSON.stringify(parseResult.actionInput) || 'None'}`);
                logger.info(`Final Answer: ${parseResult.finalAnswer || 'None'}`);
                logger.info('=== END PARSE RESULT ===');

                if (parseResult.thought) {
                    // 发送思考过程给用户
                    const thinkingMsg = MessageFactory.thinking(parseResult.thought);

                    logger.info(`💭 思考: ${parseResult.thought}`);
                    callbacks.onMessage(thinkingMsg);
                }

                if (parseResult.action && parseResult.actionInput) {
                    // 执行工具
                    logger.info('=== TOOL EXECUTION ===');
                    logger.info(`Tool Name: ${parseResult.action}`);
                    logger.info(`Tool Input: ${JSON.stringify(parseResult.actionInput, null, 2)}`);

                    // 发送工具开始消息 - 使用标准化格式
                    const actionMessage = this.getActionMessage(parseResult.action, parseResult.actionInput);
                    const toolStartMsg = MessageFactory.toolMessage(
                        parseResult.action,
                        actionMessage
                    );

                    // 调试日志
                    logger.info(`[msg][tool_start] ${actionMessage}`);
                    logger.debug(`[msg][tool_start] metadata: ${JSON.stringify(toolStartMsg.metadata)}`);

                    callbacks.onMessage(toolStartMsg);

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

                    // 发送工具完成消息 - 使用标准化格式
                    const completeMessage = this.getCompleteMessage(parseResult.action, toolResult, parseResult.actionInput);
                    const toolCompleteMsg = MessageFactory.toolMessage(
                        parseResult.action,
                        completeMessage,
                        toolResult.success,
                        toolResult.data
                    );

                    // 调试日志
                    logger.info(`[msg][${toolCompleteMsg.type}] ${completeMessage}`);
                    logger.debug(`[msg][${toolCompleteMsg.type}] metadata: ${JSON.stringify(toolCompleteMsg.metadata)}`);

                    callbacks.onMessage(toolCompleteMsg);

                    // 调试：工具执行后继续循环
                    logger.info(`🔄 工具执行完成，继续下一轮循环 (iteration ${iteration})`);
                }

                if (parseResult.finalAnswer) {
                    finalAnswer = parseResult.finalAnswer;
                    // 发送普通助手消息给用户
                    const assistantMsg = MessageFactory.assistantMessage(parseResult.finalAnswer);

                    // 调试日志
                    logger.info(`[msg][assistant] 发送回答给用户`);
                    logger.debug(`[msg][assistant] content: ${parseResult.finalAnswer}`);

                    callbacks.onMessage(assistantMsg);
                    break;
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
     * 解析 Agent JSON 响应
     */
    private parseAgentResponseJson(response: string): {
        thought?: string;
        action?: string;
        actionInput?: any;
        finalAnswer?: string;
        error?: string;
    } {
        try {
            // 尝试解析 JSON 响应
            const jsonResponse = JSON.parse(response);

            logger.info('=== JSON PARSE SUCCESS ===');
            logger.info('Parsed JSON:', JSON.stringify(jsonResponse, null, 2));

            // 严格的 JSON 格式校验
            const validationResult = this.validateJsonResponse(jsonResponse);
            if (!validationResult.valid) {
                logger.error('=== JSON VALIDATION FAILED ===');
                logger.error('Validation errors:', validationResult.errors);

                // 返回错误信息而不是抛出异常
                return {
                    error: `JSON 格式校验失败: ${validationResult.errors.join(', ')}`
                };
            }

            logger.info('=== JSON VALIDATION SUCCESS ===');

            const result: any = {};

            if (jsonResponse.thought) {
                result.thought = jsonResponse.thought;
            }

            if (jsonResponse.action) {
                result.action = jsonResponse.action;
                result.actionInput = jsonResponse.action_input || {};
            }

            if (jsonResponse.final_answer) {
                result.finalAnswer = jsonResponse.final_answer;
            }

            logger.info('=== JSON PARSE RESULT ===');
            logger.info('Final result:', JSON.stringify(result, null, 2));

            return result;

        } catch (error) {
            logger.error('JSON parsing failed:', error);

            // 返回错误信息而不是抛出异常
            return {
                error: `LLM 输出格式错误: ${error instanceof Error ? error.message : 'JSON 解析失败'}`
            };
        }
    }

    /**
     * 验证 JSON 响应格式
     */
    private validateJsonResponse(jsonResponse: any): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // 检查是否是对象
        if (typeof jsonResponse !== 'object' || jsonResponse === null || Array.isArray(jsonResponse)) {
            errors.push('响应必须是一个对象');
            return { valid: false, errors };
        }

        // 必须包含 thought 字段
        if (!jsonResponse.thought || typeof jsonResponse.thought !== 'string') {
            errors.push('缺少必需的 thought 字段或类型不正确');
        }

        // 检查是否有 action 或 final_answer
        const hasAction = jsonResponse.action && typeof jsonResponse.action === 'string';
        const hasFinalAnswer = jsonResponse.final_answer && typeof jsonResponse.final_answer === 'string';

        if (!hasAction && !hasFinalAnswer) {
            errors.push('必须包含 action 或 final_answer 字段之一');
        }

        if (hasAction && hasFinalAnswer) {
            errors.push('不能同时包含 action 和 final_answer 字段');
        }

        // 如果有 action，检查 action_input
        if (hasAction) {
            if (!jsonResponse.action_input || typeof jsonResponse.action_input !== 'object') {
                errors.push('有 action 时必须包含 action_input 对象');
            }
        }

        // 检查不允许的额外字段
        const allowedFields = ['thought', 'action', 'action_input', 'final_answer'];
        const extraFields = Object.keys(jsonResponse).filter(key => !allowedFields.includes(key));
        if (extraFields.length > 0) {
            errors.push(`包含不允许的字段: ${extraFields.join(', ')}`);
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * 解析 Agent 响应（文本模式回退）
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
