import * as vscode from 'vscode';
import { Tool, ToolCall, ToolResult, ToolExecutionContext } from './types';
import { logger } from '../utils/logger';

/**
 * 工具管理器 - 负责注册、管理和执行工具
 */
export class ToolManager {
    private tools: Map<string, Tool> = new Map();
    private context: ToolExecutionContext;

    constructor(context: ToolExecutionContext) {
        this.context = context;
    }

    /**
     * 注册工具
     */
    registerTool(tool: Tool): void {
        this.tools.set(tool.name, tool);
        logger.info(`Tool registered: ${tool.name}`);
    }

    /**
     * 获取所有工具
     */
    getTools(): Tool[] {
        return Array.from(this.tools.values());
    }

    /**
     * 获取工具定义（用于 LLM）
     */
    getToolDefinitions(): any[] {
        return this.getTools().map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: 'object',
                    properties: tool.parameters.reduce((props, param) => {
                        props[param.name] = {
                            type: param.type,
                            description: param.description
                        };
                        return props;
                    }, {} as Record<string, any>),
                    required: tool.parameters
                        .filter(p => p.required)
                        .map(p => p.name)
                }
            }
        }));
    }

    /**
     * 执行工具调用
     */
    async executeTool(toolCall: ToolCall): Promise<ToolResult> {
        const tool = this.tools.get(toolCall.name);
        
        if (!tool) {
            return {
                success: false,
                error: `Tool '${toolCall.name}' not found`
            };
        }

        try {
            logger.info(`Executing tool: ${toolCall.name}`, toolCall.arguments);
            
            // 验证参数
            const validationResult = this.validateArguments(tool, toolCall.arguments);
            if (!validationResult.success) {
                return validationResult;
            }

            // 执行工具
            const result = await tool.execute(toolCall.arguments);
            
            logger.info(`Tool execution completed: ${toolCall.name}`, {
                success: result.success,
                hasData: !!result.data,
                error: result.error
            });

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Tool execution failed: ${toolCall.name}`, error);
            
            return {
                success: false,
                error: `Tool execution failed: ${errorMessage}`
            };
        }
    }

    /**
     * 批量执行工具调用
     */
    async executeTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
        const results: ToolResult[] = [];
        
        for (const toolCall of toolCalls) {
            const result = await this.executeTool(toolCall);
            results.push(result);
            
            // 如果工具执行失败，可以选择继续或停止
            if (!result.success) {
                logger.warn(`Tool failed, continuing with next: ${toolCall.name}`);
            }
        }
        
        return results;
    }

    /**
     * 验证工具参数
     */
    private validateArguments(tool: Tool, args: Record<string, any>): ToolResult {
        for (const param of tool.parameters) {
            if (param.required && !(param.name in args)) {
                return {
                    success: false,
                    error: `Missing required parameter: ${param.name}`
                };
            }

            if (param.name in args) {
                const value = args[param.name];
                const expectedType = param.type;
                
                if (!this.validateParameterType(value, expectedType)) {
                    return {
                        success: false,
                        error: `Parameter '${param.name}' must be of type ${expectedType}`
                    };
                }
            }
        }

        return { success: true };
    }

    /**
     * 验证参数类型
     */
    private validateParameterType(value: any, expectedType: string): boolean {
        switch (expectedType) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number';
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            default:
                return true;
        }
    }

    /**
     * 更新执行上下文
     */
    updateContext(context: Partial<ToolExecutionContext>): void {
        this.context = { ...this.context, ...context };
    }

    /**
     * 获取当前上下文
     */
    getContext(): ToolExecutionContext {
        return this.context;
    }
}
