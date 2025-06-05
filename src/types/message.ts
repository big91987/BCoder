/**
 * 标准化消息格式 - 支持 Multi-Agent 架构
 */

export interface StandardMessage {
    /** 角色名称 - 用于显示发言人 */
    role: string;
    
    /** 消息类型 - 用于确定渲染样式和行为 */
    type: string;
    
    /** 消息内容 - 主要显示内容 */
    content: string;
    
    /** 时间戳 */
    timestamp: Date;
    
    /** 可选元数据 - 用于扩展信息 */
    metadata?: MessageMetadata;
}

export interface MessageMetadata {
    /** 工具名称 - 用于工具相关消息 */
    toolName?: string;
    
    /** 操作是否成功 - 用于结果类消息 */
    success?: boolean;
    
    /** 附加数据 - 任意扩展数据 */
    data?: any;
    
    /** 错误信息 - 用于错误类消息 */
    error?: string;
    
    /** 进度信息 - 用于进度类消息 */
    progress?: {
        current: number;
        total: number;
        description?: string;
    };
    
    /** 其他扩展字段 */
    [key: string]: any;
}

/**
 * 预定义的角色类型 - 简化版
 */
export enum MessageRole {
    USER = 'user',
    ASSISTANT = 'assistant',  // 统一使用 assistant 而不是 bcoder
    SYSTEM = 'system'
}

/**
 * 预定义的消息类型 - 简化版（仅保留核心类型）
 */
export enum MessageType {
    // 1. 基础对话
    TEXT = 'text',           // 普通文本消息（用户输入 + 助手回复）

    // 2. 工具执行
    TOOL = 'tool',           // 工具相关消息（开始/进度/结果/错误）

    // 3. 思考过程
    THINKING = 'thinking',   // Agent 思考过程

    // 4. 流式输出
    STREAMING_START = 'streaming_start',       // 开始流式输出
    STREAMING_DELTA = 'streaming_delta',       // 流式增量内容
    STREAMING_COMPLETE = 'streaming_complete', // 流式输出完成

    // 5. 错误信息
    ERROR = 'error',         // 错误消息

    // 6. 系统控制
    CLEAR = 'clear'          // 清除聊天
}

/**
 * 消息构建器 - 帮助创建标准化消息
 */
export class MessageBuilder {
    private message: Partial<StandardMessage> = {
        timestamp: new Date()
    };

    static create(): MessageBuilder {
        return new MessageBuilder();
    }

    role(role: string): MessageBuilder {
        this.message.role = role;
        return this;
    }

    type(type: string): MessageBuilder {
        this.message.type = type;
        return this;
    }

    content(content: string): MessageBuilder {
        this.message.content = content;
        return this;
    }

    metadata(metadata: MessageMetadata): MessageBuilder {
        this.message.metadata = { ...this.message.metadata, ...metadata };
        return this;
    }

    toolInfo(toolName: string, success?: boolean, data?: any): MessageBuilder {
        this.message.metadata = {
            ...this.message.metadata,
            toolName,
            success,
            data
        };
        return this;
    }

    error(error: string): MessageBuilder {
        this.message.metadata = {
            ...this.message.metadata,
            error
        };
        return this;
    }

    progress(current: number, total: number, description?: string): MessageBuilder {
        this.message.metadata = {
            ...this.message.metadata,
            progress: { current, total, description }
        };
        return this;
    }

    build(): StandardMessage {
        if (!this.message.role || !this.message.type || this.message.content === undefined) {
            throw new Error('Message must have role, type, and content');
        }
        return this.message as StandardMessage;
    }
}

/**
 * 消息工厂 - 快速创建常用消息类型（简化版）
 */
export class MessageFactory {
    static userMessage(content: string): StandardMessage {
        return MessageBuilder.create()
            .role(MessageRole.USER)
            .type(MessageType.TEXT)
            .content(content)
            .build();
    }

    static assistantMessage(content: string): StandardMessage {
        return MessageBuilder.create()
            .role(MessageRole.ASSISTANT)
            .type(MessageType.TEXT)
            .content(content)
            .build();
    }

    static toolMessage(toolName: string, content: string, success?: boolean, data?: any): StandardMessage {
        return MessageBuilder.create()
            .role(MessageRole.SYSTEM)
            .type(MessageType.TOOL)
            .content(content)
            .toolInfo(toolName, success, data)
            .build();
    }

    static thinking(thought: string): StandardMessage {
        return MessageBuilder.create()
            .role(MessageRole.ASSISTANT)
            .type(MessageType.THINKING)
            .content(thought)
            .build();
    }

    static error(error: string): StandardMessage {
        return MessageBuilder.create()
            .role(MessageRole.SYSTEM)
            .type(MessageType.ERROR)
            .content(error)
            .error(error)
            .build();
    }

    static clear(): StandardMessage {
        return MessageBuilder.create()
            .role(MessageRole.SYSTEM)
            .type(MessageType.CLEAR)
            .content('')
            .build();
    }

    // 流式消息工厂方法
    static streamingStart(content: string): StandardMessage {
        return MessageBuilder.create()
            .role(MessageRole.ASSISTANT)
            .type(MessageType.STREAMING_START)
            .content(content)
            .build();
    }

    static streamingDelta(content: string): StandardMessage {
        return MessageBuilder.create()
            .role(MessageRole.ASSISTANT)
            .type(MessageType.STREAMING_DELTA)
            .content(content)
            .build();
    }

    static streamingComplete(): StandardMessage {
        return MessageBuilder.create()
            .role(MessageRole.ASSISTANT)
            .type(MessageType.STREAMING_COMPLETE)
            .content('')
            .build();
    }
}
