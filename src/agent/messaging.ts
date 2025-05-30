/**
 * 通用的 Agent 消息流接口
 * 支持不同类型的 Agent 工作流
 */

export interface AgentMessage {
    id: string;
    type: AgentMessageType;
    content: string;
    metadata?: Record<string, any>;
    timestamp: Date;
    component?: string; // 可选的自定义组件类型
}

export type AgentMessageType = 
    | 'thinking'     // Agent 思考过程
    | 'planning'     // 制定计划
    | 'action'       // 执行动作
    | 'tool_call'    // 工具调用
    | 'tool_result'  // 工具结果
    | 'observation'  // 观察结果
    | 'result'       // 最终结果
    | 'error'        // 错误信息
    | 'info'         // 一般信息
    | 'warning'      // 警告信息
    | 'success'      // 成功信息
    | 'progress'     // 进度信息
    | 'custom';      // 自定义类型

export interface AgentMessageCallbacks {
    onMessage?: (message: AgentMessage) => void;
    onComplete?: (result: string) => void;
    onError?: (error: string) => void;
    onProgress?: (progress: number, message: string) => void;
}

/**
 * 消息格式化器接口
 */
export interface MessageFormatter {
    formatMessage(message: AgentMessage): string;
    getSupportedTypes(): AgentMessageType[];
}

/**
 * 默认消息格式化器
 */
export class DefaultMessageFormatter implements MessageFormatter {
    formatMessage(message: AgentMessage): string {
        const timestamp = message.timestamp.toLocaleTimeString();
        const icon = this.getIcon(message.type);
        
        switch (message.type) {
            case 'thinking':
                return `${icon} **思考**: ${message.content}\n`;
                
            case 'planning':
                return `${icon} **计划**: ${message.content}\n`;
                
            case 'action':
                return `${icon} **执行**: ${message.content}\n`;
                
            case 'tool_call':
                const toolName = message.metadata?.tool || 'unknown';
                const params = message.metadata?.parameters ? 
                    `\n   📝 参数: \`${JSON.stringify(message.metadata.parameters)}\`` : '';
                return `${icon} **工具调用**: ${toolName}${params}\n`;
                
            case 'tool_result':
                return this.formatToolResult(message);
                
            case 'observation':
                return `${icon} **观察**: ${message.content}\n`;
                
            case 'result':
                return `${icon} **结果**: ${message.content}\n`;
                
            case 'error':
                return `${icon} **错误**: ${message.content}\n`;
                
            case 'success':
                return `${icon} **成功**: ${message.content}\n`;
                
            case 'info':
                return `${icon} ${message.content}\n`;
                
            case 'warning':
                return `${icon} **警告**: ${message.content}\n`;
                
            case 'progress':
                const progress = message.metadata?.progress || 0;
                return `${icon} **进度** (${progress}%): ${message.content}\n`;
                
            case 'custom':
                return this.formatCustomMessage(message);
                
            default:
                return `${message.content}\n`;
        }
    }
    
    private formatToolResult(message: AgentMessage): string {
        const icon = this.getIcon(message.type);
        const data = message.metadata?.data;
        
        if (!data) {
            return `${icon} **工具结果**: ${message.content}\n`;
        }
        
        const toolName = message.metadata?.tool;
        let result = `${icon} **工具结果** (${toolName}):\n`;
        
        // 根据工具类型格式化结果
        switch (toolName) {
            case 'read_file':
                if (data.content) {
                    const preview = data.content.length > 500 ? 
                        data.content.substring(0, 500) + '...' : data.content;
                    result += `\`\`\`\n${preview}\n\`\`\`\n`;
                }
                break;
                
            case 'list_files':
                if (data.files && Array.isArray(data.files)) {
                    result += `📁 找到 ${data.files.length} 个文件:\n`;
                    data.files.slice(0, 10).forEach((file: any) => {
                        result += `- ${file.name} ${file.isDirectory ? '(目录)' : `(${file.size} 字节)`}\n`;
                    });
                    if (data.files.length > 10) {
                        result += `... 还有 ${data.files.length - 10} 个文件\n`;
                    }
                }
                break;
                
            case 'search_in_files':
                if (data.results && Array.isArray(data.results)) {
                    result += `🔍 搜索结果 (${data.results.length} 个匹配):\n`;
                    data.results.slice(0, 5).forEach((match: any) => {
                        result += `- ${match.path}:${match.line} - ${match.content.trim()}\n`;
                    });
                }
                break;
                
            case 'write_file':
                result += `💾 文件已创建: ${message.metadata?.parameters?.path}\n`;
                break;
                
            default:
                result += `${message.content}\n`;
        }
        
        return result;
    }
    
    private formatCustomMessage(message: AgentMessage): string {
        // 自定义消息可以有特殊的格式化逻辑
        const component = message.component;
        if (component) {
            return `[${component}] ${message.content}\n`;
        }
        return `${message.content}\n`;
    }
    
    private getIcon(type: AgentMessageType): string {
        const icons: Record<AgentMessageType, string> = {
            thinking: '🤔',
            planning: '📋',
            action: '🔧',
            tool_call: '⚡',
            tool_result: '📄',
            observation: '👀',
            result: '✨',
            error: '❌',
            success: '✅',
            info: 'ℹ️',
            warning: '⚠️',
            progress: '📊',
            custom: '🔹'
        };
        return icons[type] || '•';
    }
    
    getSupportedTypes(): AgentMessageType[] {
        return [
            'thinking', 'planning', 'action', 'tool_call', 'tool_result',
            'observation', 'result', 'error', 'success', 'info', 'warning',
            'progress', 'custom'
        ];
    }
}

/**
 * 消息构建器 - 帮助 Agent 创建标准化消息
 */
export class MessageBuilder {
    private static messageCounter = 0;
    
    static thinking(content: string, metadata?: Record<string, any>): AgentMessage {
        return this.createMessage('thinking', content, metadata);
    }
    
    static planning(content: string, metadata?: Record<string, any>): AgentMessage {
        return this.createMessage('planning', content, metadata);
    }
    
    static action(content: string, metadata?: Record<string, any>): AgentMessage {
        return this.createMessage('action', content, metadata);
    }
    
    static toolCall(tool: string, parameters: any, description?: string): AgentMessage {
        return this.createMessage('tool_call', description || `调用工具: ${tool}`, {
            tool,
            parameters
        });
    }
    
    static toolResult(tool: string, data: any, success: boolean, description?: string): AgentMessage {
        return this.createMessage('tool_result', description || (success ? '工具执行成功' : '工具执行失败'), {
            tool,
            data,
            success
        });
    }
    
    static observation(content: string, metadata?: Record<string, any>): AgentMessage {
        return this.createMessage('observation', content, metadata);
    }
    
    static result(content: string, metadata?: Record<string, any>): AgentMessage {
        return this.createMessage('result', content, metadata);
    }
    
    static error(content: string, error?: Error): AgentMessage {
        return this.createMessage('error', content, {
            error: error?.message,
            stack: error?.stack
        });
    }
    
    static success(content: string, metadata?: Record<string, any>): AgentMessage {
        return this.createMessage('success', content, metadata);
    }
    
    static info(content: string, metadata?: Record<string, any>): AgentMessage {
        return this.createMessage('info', content, metadata);
    }
    
    static progress(progress: number, content: string, metadata?: Record<string, any>): AgentMessage {
        return this.createMessage('progress', content, {
            progress,
            ...metadata
        });
    }
    
    static custom(content: string, component?: string, metadata?: Record<string, any>): AgentMessage {
        return this.createMessage('custom', content, metadata, component);
    }
    
    private static createMessage(
        type: AgentMessageType, 
        content: string, 
        metadata?: Record<string, any>,
        component?: string
    ): AgentMessage {
        return {
            id: `msg_${++this.messageCounter}_${Date.now()}`,
            type,
            content,
            metadata,
            timestamp: new Date(),
            component
        };
    }
}
