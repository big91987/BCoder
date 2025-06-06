/**
 * 标准化消息格式 - 支持 Multi-Agent 架构
 */

/**
 * 消息状态 - 用于流式处理
 */
export type MessageStatus = 'start' | 'delta' | 'end';

export interface StandardMessage {
    /** 角色名称 - 用于显示发言人（支持multi-agent） */
    role: string;

    /** 消息类型 - 用于确定渲染样式和行为 */
    type: string;

    /** 消息内容 - 主要显示内容 */
    content: string;

    /** 消息状态 - 用于流式处理 */
    status: MessageStatus;

    /** 时间戳 */
    timestamp: Date;

    /** 可选元数据 - 用于扩展信息 */
    metadata?: MessageMetadata;

    /** 消息ID - 用于追踪流式消息 */
    id?: string;
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
 * 预定义的消息类型 - 核心类型
 */
export enum MessageType {
    /** 思考过程 - 可收起的思考框 */
    THINK = 'think',

    /** 工具执行 - 工具调用和结果 */
    TOOL = 'tool',

    /** 文本回复 - 普通对话内容 */
    TEXT = 'text',

    /** 错误信息 */
    ERROR = 'error'
}

/**
 * 消息构建器 - 帮助创建标准化消息
 */
export class MessageBuilder {
    private message: Partial<StandardMessage> = {
        timestamp: new Date(),
        status: 'end' // 默认为完整消息
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

    status(status: MessageStatus): MessageBuilder {
        this.message.status = status;
        return this;
    }

    id(id: string): MessageBuilder {
        this.message.id = id;
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
        if (!this.message.role || !this.message.type || this.message.content === undefined || !this.message.status) {
            throw new Error('Message must have role, type, content, and status');
        }
        return this.message as StandardMessage;
    }
}

/**
 * 消息工厂 - 快速创建常用消息类型
 */
export class MessageFactory {
    private static generateId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    static userMessage(content: string, role: string = MessageRole.USER): StandardMessage {
        return MessageBuilder.create()
            .role(role)
            .type(MessageType.TEXT)
            .content(content)
            .status('end')
            .build();
    }

    static textMessage(content: string, status: MessageStatus = 'end', role: string = MessageRole.ASSISTANT): StandardMessage {
        return MessageBuilder.create()
            .role(role)
            .type(MessageType.TEXT)
            .content(content)
            .status(status)
            .id(this.generateId())
            .build();
    }

    static thinkMessage(content: string, status: MessageStatus = 'end', role: string = MessageRole.ASSISTANT): StandardMessage {
        return MessageBuilder.create()
            .role(role)
            .type(MessageType.THINK)
            .content(content)
            .status(status)
            .id(this.generateId())
            .build();
    }

    static toolMessage(
        content: string,
        status: MessageStatus = 'end',
        role: string = MessageRole.ASSISTANT,
        toolName?: string,
        success?: boolean,
        data?: any
    ): StandardMessage {
        const builder = MessageBuilder.create()
            .role(role)
            .type(MessageType.TOOL)
            .content(content)
            .status(status)
            .id(this.generateId());

        if (toolName !== undefined) {
            builder.toolInfo(toolName, success, data);
        }

        return builder.build();
    }

    static errorMessage(content: string, role: string = MessageRole.ASSISTANT, error?: string): StandardMessage {
        return MessageBuilder.create()
            .role(role)
            .type(MessageType.ERROR)
            .content(content)
            .status('end')
            .error(error || content)
            .build();
    }
}
