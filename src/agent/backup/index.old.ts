import * as vscode from 'vscode';
import { ToolSystem } from '../tools';
import { AIClient } from '../utils/aiClient';
import { logger } from '../utils/logger';

// 为了向后兼容，保留旧的 AgentSystem
// 但实际上新架构应该使用 AgentManager

export interface AgentConfig {
    maxStepsPerTask: number;
    maxExecutionTime: number;
    enableReflection: boolean;
    autoApprove: boolean;
    riskTolerance: 'low' | 'medium' | 'high';
    debugMode: boolean;
}

export interface AgentCallbacks {
    onTaskStarted?: (task: any) => void;
    onTaskCompleted?: (task: any, reflection: any) => void;
    onTaskFailed?: (task: any, error: string) => void;
    onStepStarted?: (step: any) => void;
    onStepCompleted?: (step: any, result: any) => void;
    onUserInterventionRequired?: (reason: string, context: any) => Promise<boolean>;
    onProgress?: (progress: number, message: string) => void;
    onMessage?: (message: any) => void;
    onComplete?: (result: string) => void;
    onError?: (error: string) => void;
}

/**
 * Agent 系统管理器 - 向后兼容包装器
 * 实际使用新的 AgentManager 架构
 */
export class AgentSystem {
    private agentManager: any = null;
    private toolSystem: ToolSystem;
    private aiClient: AIClient;
    private workspaceRoot: string;
    private config: AgentConfig;

    constructor(toolSystem: ToolSystem, aiClient: AIClient, workspaceRoot: string) {
        this.toolSystem = toolSystem;
        this.aiClient = aiClient;
        this.workspaceRoot = workspaceRoot;

        // 默认配置
        this.config = {
            maxStepsPerTask: 10,
            maxExecutionTime: 300000, // 5分钟
            enableReflection: true,
            autoApprove: false,
            riskTolerance: 'medium',
            debugMode: false
        };

        // 初始化新的 AgentManager
        this.initializeAgentManager();

        logger.info('Agent system initialized (legacy wrapper)');
    }

    private async initializeAgentManager() {
        try {
            const { AgentManager } = require('./agentManager');
            this.agentManager = new AgentManager();
            await this.agentManager.initializeDefault({
                toolSystem: this.toolSystem,
                agentSystem: this
            });
        } catch (error) {
            logger.error('Failed to initialize AgentManager:', error);
        }
    }

    /**
     * 创建并启动 Agent
     */
    async createAgent(callbacks?: AgentCallbacks): Promise<BCoderAgent> {
        if (this.agent) {
            this.agent.dispose();
        }

        const agentCallbacks: AgentCallbacks = {
            onTaskStarted: (task) => {
                logger.info(`Task started: ${task.description}`);
                callbacks?.onTaskStarted?.(task);
            },

            onTaskCompleted: (task, reflection) => {
                logger.info(`Task completed: ${task.id}, success: ${reflection.success}`);
                callbacks?.onTaskCompleted?.(task, reflection);
            },

            onTaskFailed: (task, error) => {
                logger.error(`Task failed: ${task.id}, error: ${error}`);
                callbacks?.onTaskFailed?.(task, error);
            },

            onStepStarted: (step) => {
                logger.debug(`Step started: ${step.description}`);
                callbacks?.onStepStarted?.(step);
            },

            onStepCompleted: (step, result) => {
                logger.debug(`Step completed: ${step.id}, success: ${result.success}`);
                callbacks?.onStepCompleted?.(step, result);
            },

            onUserInterventionRequired: async (reason, context) => {
                logger.info(`User intervention required: ${reason}`);

                if (callbacks?.onUserInterventionRequired) {
                    return await callbacks.onUserInterventionRequired(reason, context);
                }

                // 默认实现：显示确认对话框
                const choice = await vscode.window.showWarningMessage(
                    `BCoder Agent 需要确认: ${reason}`,
                    { modal: true },
                    '允许',
                    '拒绝'
                );

                return choice === '允许';
            },

            onProgress: (progress, message) => {
                logger.debug(`Progress: ${progress}% - ${message}`);
                callbacks?.onProgress?.(progress, message);
            }
        };

        this.agent = new BCoderAgent(
            this.toolSystem,
            this.aiClient,
            this.workspaceRoot,
            this.config,
            agentCallbacks
        );

        // 添加事件监听器用于调试
        if (this.config.debugMode) {
            this.setupDebugListeners();
        }

        logger.info('Agent created successfully');
        return this.agent;
    }

    /**
     * 处理用户请求 - 使用新的 AgentManager
     */
    async processRequest(userRequest: string, callbacks?: AgentCallbacks): Promise<string> {
        try {
            if (!this.agentManager) {
                await this.initializeAgentManager();
            }

            const agent = this.agentManager.getCurrentAgent();
            if (!agent) {
                throw new Error('No agent available');
            }

            logger.info('Processing user request through agent (legacy):', userRequest);

            // 转换回调格式
            const agentCallbacks = {
                onMessage: (message: any) => {
                    // 根据消息类型调用相应的回调
                    switch (message.type) {
                        case 'task_start':
                            callbacks?.onTaskStarted?.({ description: message.content });
                            break;
                        case 'task_complete':
                            callbacks?.onTaskCompleted?.({ id: 'task' }, { success: true });
                            break;
                        case 'step_start':
                            callbacks?.onStepStarted?.({ description: message.content });
                            break;
                        case 'step_complete':
                            callbacks?.onStepCompleted?.({ id: 'step' }, { success: true });
                            break;
                        case 'progress':
                            callbacks?.onProgress?.(message.data?.progress || 0, message.content);
                            break;
                    }
                },
                onComplete: (result: string) => {
                    callbacks?.onComplete?.(result);
                },
                onError: (error: string) => {
                    callbacks?.onError?.(error);
                    callbacks?.onTaskFailed?.({ id: 'task' }, error);
                }
            };

            const result = await agent.processRequest({
                message: userRequest,
                context: { workspaceRoot: this.workspaceRoot },
                sessionId: `legacy_${Date.now()}`
            }, agentCallbacks);

            return result.result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Agent request processing failed:', error);
            return `Agent 处理请求时出现错误: ${errorMessage}`;
        }
    }

    /**
     * 获取当前 Agent - 向后兼容
     */
    getAgent(): any {
        return this.agentManager?.getCurrentAgent() || null;
    }

    /**
     * 更新配置
     */
    updateConfig(updates: Partial<AgentConfig>): void {
        this.config = { ...this.config, ...updates };
        logger.info('Agent system config updated:', updates);
    }

    /**
     * 获取配置
     */
    getConfig(): AgentConfig {
        return { ...this.config };
    }

    /**
     * 停止当前 Agent
     */
    stop(): void {
        if (this.agentManager) {
            this.agentManager.getCurrentAgent()?.stop();
            logger.info('Agent stopped');
        }
    }

    /**
     * 设置调试监听器
     */
    private setupDebugListeners(): void {
        if (!this.agent) return;

        const eventTypes: AgentEventType[] = [
            'task_started',
            'task_completed',
            'task_failed',
            'plan_created',
            'step_started',
            'step_completed',
            'step_failed',
            'reflection_started',
            'reflection_completed',
            'user_intervention_required'
        ];

        eventTypes.forEach(eventType => {
            this.agent!.addEventListener(eventType, (event: any) => {
                logger.debug(`Agent Event [${eventType}]:`, event.data);
            });
        });
    }

    /**
     * 获取 Agent 状态摘要
     */
    getStatusSummary(): string {
        if (!this.agent) {
            return 'Agent 未初始化';
        }

        const state = this.agent.getState();
        const config = this.agent.getConfig();

        let summary = '🤖 BCoder Agent 状态:\n\n';

        summary += `📊 基本信息:\n`;
        summary += `• 状态: ${state.isActive ? '🟢 运行中' : '🔴 空闲'}\n`;
        summary += `• 工作区: ${state.context.workspaceRoot}\n`;
        summary += `• 当前文件: ${state.context.activeFile || '无'}\n\n`;

        if (state.currentTask) {
            summary += `📋 当前任务:\n`;
            summary += `• ID: ${state.currentTask.id}\n`;
            summary += `• 描述: ${state.currentTask.description}\n`;
            summary += `• 类型: ${state.currentTask.type}\n`;
            summary += `• 状态: ${state.currentTask.status}\n\n`;
        }

        summary += `⚙️ 配置:\n`;
        summary += `• 最大步骤数: ${config.maxStepsPerTask}\n`;
        summary += `• 最大执行时间: ${config.maxExecutionTime / 1000}秒\n`;
        summary += `• 启用反思: ${config.enableReflection ? '是' : '否'}\n`;
        summary += `• 自动批准: ${config.autoApprove ? '是' : '否'}\n`;
        summary += `• 风险容忍度: ${config.riskTolerance}\n`;
        summary += `• 调试模式: ${config.debugMode ? '是' : '否'}\n\n`;

        summary += `📈 执行历史:\n`;
        summary += `• 总步骤数: ${state.executionHistory.length}\n`;

        if (state.executionHistory.length > 0) {
            const successful = state.executionHistory.filter(r => r.success).length;
            const successRate = (successful / state.executionHistory.length * 100).toFixed(1);
            summary += `• 成功率: ${successRate}%\n`;

            const totalDuration = state.executionHistory.reduce((sum, r) => sum + r.duration, 0);
            summary += `• 总耗时: ${totalDuration}ms\n`;
        }

        if (state.lastReflection) {
            summary += `\n🤔 最近反思:\n`;
            summary += `• 任务成功: ${state.lastReflection.success ? '是' : '否'}\n`;
            summary += `• 经验教训: ${state.lastReflection.lessonsLearned.length} 条\n`;
            summary += `• 改进建议: ${state.lastReflection.improvements.length} 条\n`;
        }

        return summary;
    }

    /**
     * 清理资源
     */
    dispose(): void {
        if (this.agent) {
            this.agent.dispose();
            this.agent = null;
        }

        logger.info('Agent system disposed');
    }
}

/**
 * 创建 Agent 系统实例
 */
export function createAgentSystem(
    toolSystem: ToolSystem,
    aiClient: AIClient,
    workspaceRoot: string
): AgentSystem {
    return new AgentSystem(toolSystem, aiClient, workspaceRoot);
}

// 导出所有类型和类
export * from './types';
export { BCoderAgent } from './agentLoop';
export { ContextManager } from './contextManager';
export { TaskPlanner } from './taskPlanner';
export { StepExecutor } from './stepExecutor';
export { ReflectionEngine } from './reflectionEngine';
