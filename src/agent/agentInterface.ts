/**
 * 标准化的 Agent 接口定义
 * 所有 Agent 都必须实现这个接口
 */

export type AgentMessageType =
    | 'user_message'           // 用户输入消息
    | 'assistant_message'      // 助手回复消息
    | 'tool_start'            // 工具开始执行
    | 'tool_progress'         // 工具执行进度
    | 'tool_complete'         // 工具执行完成
    | 'tool_error'            // 工具执行错误
    | 'thinking'              // Agent 思考过程
    | 'planning'              // Agent 规划过程
    | 'system_info'           // 系统信息
    | 'error'                 // 错误信息
    | 'progress'              // 整体进度
    | 'task_start'            // 任务开始
    | 'task_complete'         // 任务完成
    | 'step_start'            // 步骤开始 (向后兼容)
    | 'step_complete'         // 步骤完成 (向后兼容)
    | 'plan';                 // 计划 (向后兼容)

export interface AgentMessage {
    type: AgentMessageType;
    content: string;
    data?: {
        // 工具相关
        toolName?: string;
        toolInput?: any;
        toolOutput?: any;

        // 进度相关
        progress?: number;
        totalSteps?: number;
        currentStep?: number;

        // 状态相关
        success?: boolean;
        error?: string;

        // 元数据
        timestamp?: string;
        duration?: number;
        metadata?: any;

        // 向后兼容
        [key: string]: any;
    };
    timestamp: Date;
}

export interface AgentCallbacks {
    onMessage: (message: AgentMessage) => void;
    onComplete: (result: string) => void;
    onError: (error: string) => void;
}

export interface AgentConfig {
    name: string;
    version: string;
    description: string;
    capabilities: string[];
    settings?: Record<string, any>;
}

export interface AgentRequest {
    message: string;
    context?: {
        workspaceRoot?: string;
        activeFile?: string;
        selectedText?: string;
        [key: string]: any;
    };
    sessionId: string;
}

export interface AgentResponse {
    success: boolean;
    result: string;
    error?: string;
    metadata?: {
        executionTime: number;
        stepsExecuted: number;
        toolsUsed: string[];
        [key: string]: any;
    };
}

/**
 * 标准 Agent 接口
 * 所有 Agent 实现都必须遵循这个接口
 */
export interface IAgent {
    /**
     * Agent 配置信息
     */
    readonly config: AgentConfig;

    /**
     * 初始化 Agent
     */
    initialize(context: any): Promise<void>;

    /**
     * 处理用户请求
     * @param request 用户请求
     * @param callbacks 回调函数，用于实时输出中间过程
     * @returns 最终结果
     */
    processRequest(request: AgentRequest, callbacks: AgentCallbacks): Promise<AgentResponse>;

    /**
     * 停止当前执行
     */
    stop(): Promise<void>;

    /**
     * 清理资源
     */
    dispose(): Promise<void>;

    /**
     * 获取 Agent 状态
     */
    getStatus(): {
        isActive: boolean;
        currentTask?: string;
        progress?: number;
    };
}

/**
 * Agent 工厂接口
 */
export interface IAgentFactory {
    /**
     * 创建 Agent 实例
     */
    createAgent(config?: Record<string, any>): Promise<IAgent>;

    /**
     * 获取支持的 Agent 类型
     */
    getSupportedTypes(): string[];
}

/**
 * Agent 管理器接口
 */
export interface IAgentManager {
    /**
     * 注册 Agent 工厂
     */
    registerAgentFactory(type: string, factory: IAgentFactory): void;

    /**
     * 创建指定类型的 Agent
     */
    createAgent(type: string, config?: Record<string, any>): Promise<IAgent>;

    /**
     * 获取当前活跃的 Agent
     */
    getCurrentAgent(): IAgent | null;

    /**
     * 切换到指定的 Agent
     */
    switchAgent(type: string, config?: Record<string, any>): Promise<void>;

    /**
     * 获取所有可用的 Agent 类型
     */
    getAvailableAgents(): Array<{
        type: string;
        config: AgentConfig;
    }>;
}
