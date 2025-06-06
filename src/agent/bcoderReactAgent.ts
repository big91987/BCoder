import { IAgent, AgentConfig, AgentRequest, AgentResponse, AgentCallbacks } from './agentInterface';
import { ToolSystem } from '../tools';
import { AIClient } from '../utils/aiClient';
import { logger } from '../utils/logger';
import { StandardMessage, MessageType, MessageFactory, MessageStatus } from '../types/message';

// ===== BCoderReactAgent 专用的事件驱动解析器 =====

/**
 * 解析事件类型
 */
interface ParseEvent {
    type: 'thought_start' | 'thought_delta' | 'thought_end' |
          'answer_start' | 'answer_delta' | 'answer_end' |
          'action_complete' | 'error';
    content?: string;
    data?: any;
    timestamp?: number;
}

/**
 * 解析器状态
 */
interface ParserState {
    currentSection: 'none' | 'thought' | 'answer' | 'action';
    thoughtContent: string;
    answerContent: string;
    actionName: string;
    actionInput: any;
    isThoughtComplete: boolean;
    isAnswerComplete: boolean;
    isActionComplete: boolean;
}

/**
 * BCoderReactAgent 专用的事件驱动解析器
 */
abstract class ReactAgentParser {
    protected state: ParserState = {
        currentSection: 'none',
        thoughtContent: '',
        answerContent: '',
        actionName: '',
        actionInput: null,
        isThoughtComplete: false,
        isAnswerComplete: false,
        isActionComplete: false
    };

    protected fullResponse: string = '';
    protected debug: boolean = false;

    constructor(debug: boolean = false) {
        this.debug = debug;
    }

    /**
     * 解析新的chunk，返回事件列表
     */
    abstract parseChunk(chunk: string): ParseEvent[];

    /**
     * 重置解析器状态
     */
    reset(): void {
        this.state = {
            currentSection: 'none',
            thoughtContent: '',
            answerContent: '',
            actionName: '',
            actionInput: null,
            isThoughtComplete: false,
            isAnswerComplete: false,
            isActionComplete: false
        };
        this.fullResponse = '';
        this.debugLog('Parser reset');
    }

    /**
     * 获取当前状态
     */
    getCurrentState(): ParserState {
        return { ...this.state };
    }

    /**
     * 调试日志
     */
    protected debugLog(message: string, data?: any): void {
        if (this.debug) {
            logger.debug(`🔍 [ReactParser] ${message}`, data);
        }
    }

    /**
     * 创建事件
     */
    protected createEvent(type: ParseEvent['type'], content?: string, data?: any): ParseEvent {
        return {
            type,
            content,
            data,
            timestamp: Date.now()
        };
    }
}

/**
 * 单token格式解析器 (THOUGHT: / ANSWER: / ACTION:)
 * 事件驱动实现
 */
class SingleTokenReactParser extends ReactAgentParser {
    parseChunk(chunk: string): ParseEvent[] {
        this.fullResponse += chunk;
        const events: ParseEvent[] = [];

        this.debugLog('Parsing chunk', {
            chunk,
            fullResponseLength: this.fullResponse.length
        });

        // 解析当前完整响应
        const newState = this.parseFullResponse(this.fullResponse);

        // 比较状态变化，生成事件
        events.push(...this.generateEvents(newState));

        return events;
    }

    private parseFullResponse(response: string): Partial<ParserState> {
        const newState: Partial<ParserState> = {};

        // 解析 THOUGHT
        const thoughtMatch = response.match(/THOUGHT:\s*(.+?)(?=\s*(?:ACTION|ANSWER)|$)/s);
        if (thoughtMatch) {
            newState.thoughtContent = thoughtMatch[1].trim();
            newState.isThoughtComplete = /THOUGHT:\s*.+?\s*(?:ACTION|ANSWER)/.test(response);
        }

        // 解析 ACTION
        const actionMatch = response.match(/ACTION:\s*(.+?)(?=\s*(?:ACTION_INPUT|THOUGHT|ANSWER)|$)/s);
        if (actionMatch) {
            newState.actionName = actionMatch[1].trim();
        }

        // 解析 ACTION_INPUT
        const actionInputMatch = response.match(/ACTION_INPUT:\s*(.+?)(?=\s*(?:THOUGHT|ANSWER)|$)/s);
        if (actionInputMatch) {
            try {
                newState.actionInput = JSON.parse(actionInputMatch[1].trim());
                newState.isActionComplete = !!(newState.actionName && newState.actionInput);
            } catch (error) {
                newState.actionInput = null;
                newState.isActionComplete = false;
            }
        }

        // 解析 ANSWER
        const answerMatch = response.match(/ANSWER:\s*(.+?)$/s);
        if (answerMatch) {
            newState.answerContent = answerMatch[1].trim();
            newState.isAnswerComplete = true; // 到达末尾就认为完整
        }

        return newState;
    }

    private generateEvents(newState: Partial<ParserState>): ParseEvent[] {
        const events: ParseEvent[] = [];

        // 处理 THOUGHT 变化
        if (newState.thoughtContent !== undefined) {
            if (this.state.thoughtContent === '' && newState.thoughtContent !== '') {
                // 开始思考
                events.push(this.createEvent('thought_start'));
                this.state.currentSection = 'thought';
                this.debugLog('Thought started');
            }

            if (newState.thoughtContent !== this.state.thoughtContent) {
                // 思考内容增量
                const delta = newState.thoughtContent.substring(this.state.thoughtContent.length);
                if (delta) {
                    events.push(this.createEvent('thought_delta', delta));
                    this.debugLog('Thought delta', { delta });
                }
                this.state.thoughtContent = newState.thoughtContent;
            }

            if (newState.isThoughtComplete && !this.state.isThoughtComplete) {
                // 思考完成
                events.push(this.createEvent('thought_end', this.state.thoughtContent));
                this.state.isThoughtComplete = true;
                this.debugLog('Thought completed');
            }
        }

        // 处理 ANSWER 变化
        if (newState.answerContent !== undefined) {
            if (this.state.answerContent === '' && newState.answerContent !== '') {
                // 开始回答
                events.push(this.createEvent('answer_start'));
                this.state.currentSection = 'answer';
                this.debugLog('Answer started');
            }

            if (newState.answerContent !== this.state.answerContent) {
                // 回答内容增量
                const delta = newState.answerContent.substring(this.state.answerContent.length);
                if (delta) {
                    events.push(this.createEvent('answer_delta', delta));
                    this.debugLog('Answer delta', { delta });
                }
                this.state.answerContent = newState.answerContent;
            }

            if (newState.isAnswerComplete && !this.state.isAnswerComplete) {
                // 回答完成
                events.push(this.createEvent('answer_end', this.state.answerContent));
                this.state.isAnswerComplete = true;
                this.debugLog('Answer completed');
            }
        }

        // 处理 ACTION 完成
        if (newState.isActionComplete && !this.state.isActionComplete) {
            this.state.actionName = newState.actionName || '';
            this.state.actionInput = newState.actionInput;
            this.state.isActionComplete = true;

            events.push(this.createEvent('action_complete', '', {
                action: this.state.actionName,
                input: this.state.actionInput
            }));
            this.debugLog('Action completed', {
                action: this.state.actionName,
                input: this.state.actionInput
            });
        }

        return events;
    }
}

/**
 * XML格式解析器 (<thought></thought> / <answer></answer> / <action></action>)
 * 事件驱动实现
 */
class XMLReactParser extends ReactAgentParser {
    parseChunk(chunk: string): ParseEvent[] {
        this.fullResponse += chunk;
        const events: ParseEvent[] = [];

        this.debugLog('Parsing XML chunk', {
            chunk,
            fullResponseLength: this.fullResponse.length
        });

        // 解析当前完整响应
        const newState = this.parseXMLResponse(this.fullResponse);

        // 比较状态变化，生成事件
        events.push(...this.generateXMLEvents(newState));

        return events;
    }

    private parseXMLResponse(response: string): Partial<ParserState> {
        const newState: Partial<ParserState> = {};

        // 解析 <thought>...</thought>
        const thoughtMatch = response.match(/<thought>(.*?)(<\/thought>|$)/s);
        if (thoughtMatch) {
            newState.thoughtContent = thoughtMatch[1].trim();
            newState.isThoughtComplete = thoughtMatch[2] === '</thought>';
        }

        // 解析 <answer>...</answer>
        const answerMatch = response.match(/<answer>(.*?)(<\/answer>|$)/s);
        if (answerMatch) {
            newState.answerContent = answerMatch[1].trim();
            newState.isAnswerComplete = answerMatch[2] === '</answer>';
        }

        // 解析 <action><name>...</name><input>...</input></action>
        const actionMatch = response.match(/<action>(.*?)(<\/action>|$)/s);
        if (actionMatch) {
            const actionContent = actionMatch[1];
            const isActionComplete = actionMatch[2] === '</action>';

            const nameMatch = actionContent.match(/<name>(.*?)(<\/name>|$)/s);
            if (nameMatch) {
                newState.actionName = nameMatch[1].trim();
            }

            const inputMatch = actionContent.match(/<input>(.*?)(<\/input>|$)/s);
            if (inputMatch) {
                try {
                    newState.actionInput = JSON.parse(inputMatch[1].trim());
                } catch (error) {
                    newState.actionInput = null;
                }
            }

            newState.isActionComplete = isActionComplete && !!(newState.actionName && newState.actionInput);
        }

        return newState;
    }

    private generateXMLEvents(newState: Partial<ParserState>): ParseEvent[] {
        const events: ParseEvent[] = [];

        // 处理 thought 变化（与SingleToken类似的逻辑）
        if (newState.thoughtContent !== undefined) {
            if (this.state.thoughtContent === '' && newState.thoughtContent !== '') {
                events.push(this.createEvent('thought_start'));
                this.state.currentSection = 'thought';
                this.debugLog('XML Thought started');
            }

            if (newState.thoughtContent !== this.state.thoughtContent) {
                const delta = newState.thoughtContent.substring(this.state.thoughtContent.length);
                if (delta) {
                    events.push(this.createEvent('thought_delta', delta));
                    this.debugLog('XML Thought delta', { delta });
                }
                this.state.thoughtContent = newState.thoughtContent;
            }

            if (newState.isThoughtComplete && !this.state.isThoughtComplete) {
                events.push(this.createEvent('thought_end', this.state.thoughtContent));
                this.state.isThoughtComplete = true;
                this.debugLog('XML Thought completed');
            }
        }

        // 处理 answer 变化
        if (newState.answerContent !== undefined) {
            if (this.state.answerContent === '' && newState.answerContent !== '') {
                events.push(this.createEvent('answer_start'));
                this.state.currentSection = 'answer';
                this.debugLog('XML Answer started');
            }

            if (newState.answerContent !== this.state.answerContent) {
                const delta = newState.answerContent.substring(this.state.answerContent.length);
                if (delta) {
                    events.push(this.createEvent('answer_delta', delta));
                    this.debugLog('XML Answer delta', { delta });
                }
                this.state.answerContent = newState.answerContent;
            }

            if (newState.isAnswerComplete && !this.state.isAnswerComplete) {
                events.push(this.createEvent('answer_end', this.state.answerContent));
                this.state.isAnswerComplete = true;
                this.debugLog('XML Answer completed');
            }
        }

        // 处理 action 完成
        if (newState.isActionComplete && !this.state.isActionComplete) {
            this.state.actionName = newState.actionName || '';
            this.state.actionInput = newState.actionInput;
            this.state.isActionComplete = true;

            events.push(this.createEvent('action_complete', '', {
                action: this.state.actionName,
                input: this.state.actionInput
            }));
            this.debugLog('XML Action completed', {
                action: this.state.actionName,
                input: this.state.actionInput
            });
        }

        return events;
    }
}


/**
 * BCoder ReAct Agent 实现
 * 基于 ReAct 循环的智能代码助手，包含自定义的事件驱动解析器
 */
export class BCoderReactAgent implements IAgent {
    public readonly config: AgentConfig = {
        name: 'BCoder ReAct Agent',
        version: '1.0.0',
        description: 'BCoder ReAct智能代码助手，基于事件驱动的流式解析器',
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
    private parser!: ReactAgentParser;  // 使用事件驱动解析器

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

            // 🔧 初始化事件驱动解析器 - 可配置格式
            // 可以通过配置或环境变量来选择解析器类型
            const useXMLParser = false; // 设置为 true 来测试XML格式

            if (useXMLParser) {
                this.parser = new XMLReactParser(true);
                logger.info(`🏭 Initialized XML event-driven parser`);
            } else {
                this.parser = new SingleTokenReactParser(true);
                logger.info(`🏭 Initialized SingleToken event-driven parser`);
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

        // 🔧 系统提示词 - 使用单token格式，避免token分割问题
        const systemPrompt = `你是一个智能代码助手。你可以使用以下工具来帮助用户：

${toolDescriptions}

请严格按照以下格式输出，不要使用JSON格式：

如果需要使用工具：
THOUGHT: [详细的分析和思考过程]
ACTION: [工具名称]
ACTION_INPUT: [JSON格式的工具参数]

如果可以直接回答：
THOUGHT: [基于已有信息的分析]
ANSWER: [完整的最终答案，可以多行]

重要规则：
1. 每个字段必须独占一行，以字段名开头
2. 使用 ANSWER: 而不是 FINAL_ANSWER:（避免token分割）
3. ANSWER 可以包含多行内容
4. 不要使用JSON格式或其他格式
5. 严格按照上述格式，不要添加额外的标记
6. 记住之前的对话内容，保持上下文连贯性

示例：
THOUGHT: 用户询问我的身份，我可以直接回答，不需要使用任何工具
ANSWER: 我是一个智能代码助手，可以帮助你处理与文件操作相关的任务，如读取、写入、编辑文件等。`;

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
                let hasAction = false;
                let actionName = '';
                let actionInput: any = null;
                let chunkCount = 0;

                // 🔧 重置解析器状态
                this.parser.reset();

                await this.aiClient!.chatStream(currentMessage, historyMessages, (chunk: string) => {
                    chunkCount++;
                    fullResponse += chunk;

                    // 🔧 添加调试：显示LLM的原始响应
                    if (chunkCount <= 5 || chunkCount % 10 === 0) {
                        logger.info(`📝 LLM Chunk ${chunkCount}: "${chunk}"`);
                        logger.info(`📝 Full Response so far (${fullResponse.length} chars): "${fullResponse}"`);
                    }

                    // 🔧 使用事件驱动解析器
                    const events = this.parser.parseChunk(chunk);

                    // 🔧 处理解析事件
                    for (const event of events) {
                        logger.info(`🎯 Parse Event: ${event.type}`, { content: event.content, data: event.data });

                        switch (event.type) {
                            case 'thought_start':
                                callbacks.onMessage(MessageFactory.thinkMessage('', 'start', 'BCoder'));
                                break;

                            case 'thought_delta':
                                if (event.content) {
                                    callbacks.onMessage(MessageFactory.thinkMessage(event.content, 'delta', 'BCoder'));
                                }
                                break;

                            case 'thought_end':
                                callbacks.onMessage(MessageFactory.thinkMessage(event.content || '', 'end', 'BCoder'));
                                break;

                            case 'answer_start':
                                callbacks.onMessage(MessageFactory.textMessage('', 'start', 'BCoder'));
                                break;

                            case 'answer_delta':
                                if (event.content) {
                                    callbacks.onMessage(MessageFactory.textMessage(event.content, 'delta', 'BCoder'));
                                }
                                break;

                            case 'answer_end':
                                callbacks.onMessage(MessageFactory.textMessage(event.content || '', 'end', 'BCoder'));
                                break;

                            case 'action_complete':
                                if (event.data) {
                                    actionName = event.data.action;
                                    actionInput = event.data.input;
                                    hasAction = true;
                                    logger.info(`🔧 Action detected: ${actionName}`, actionInput);
                                }
                                break;

                            case 'error':
                                logger.error(`❌ Parse error: ${event.content}`, event.data);
                                break;
                        }
                    }
                });

                conversation.push({ role: 'assistant' as const, content: fullResponse });

                // 🔧 获取最终状态
                const finalState = this.parser.getCurrentState();
                logger.info(`🎯 流式处理完成`, {
                    hasThought: !!finalState.thoughtContent,
                    hasAnswer: !!finalState.answerContent,
                    hasAction: !!finalState.actionName,
                    actionName: finalState.actionName
                });

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
                if (finalState.answerContent) {
                    finalAnswer = finalState.answerContent;
                    break; // 明确终止循环
                }

                // 如果既没有工具也没有最终答案，说明有 bug，直接报错
                if (!hasAction && !finalState.answerContent) {
                    const errorMsg = `❌ 流式解析失败：hasAction=${hasAction}, finalAnswer="${finalState.answerContent}", fullResponse="${fullResponse}"`;
                    logger.error(errorMsg);
                    callbacks.onMessage(MessageFactory.errorMessage(errorMsg, 'BCoder'));
                    throw new Error('流式解析失败，请检查 LLM 响应格式或解析逻辑');
                }



            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error(`💥 第 ${iteration} 轮执行出现异常: ${errorMessage}`);
                logger.error(`Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`);

                const errorMsg = MessageFactory.errorMessage(
                    `❌ 第 ${iteration} 轮执行失败: ${errorMessage}`,
                    'BCoder'
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
            const maxIterationMsg = MessageFactory.errorMessage('⚠️ 达到最大迭代次数', 'BCoder');

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





    // 🔧 旧的解析方法已移除，现在使用新的解析器架构

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
        const toolStartMsg = MessageFactory.toolMessage(actionMessage, 'start', 'BCoder', action);
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
            completeMessage,
            'end',
            'BCoder',
            action,
            toolResult.success,
            toolResult.data
        );
        callbacks.onMessage(toolCompleteMsg);
    }


}
