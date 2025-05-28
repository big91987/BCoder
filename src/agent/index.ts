import * as vscode from 'vscode';
import { BCoderAgent } from './agentLoop';
import { ToolSystem } from '../tools';
import { AIClient } from '../utils/aiClient';
import { AgentConfig, AgentCallbacks, AgentEventType } from './types';
import { logger } from '../utils/logger';

/**
 * Agent 系统管理器
 */
export class AgentSystem {
    private agent: BCoderAgent | null = null;
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

        logger.info('Agent system initialized');
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
     * 处理用户请求
     */
    async processRequest(userRequest: string, callbacks?: AgentCallbacks): Promise<string> {
        try {
            if (!this.agent) {
                this.agent = await this.createAgent(callbacks);
            }

            logger.info('Processing user request through agent:', userRequest);
            const result = await this.agent.processRequest(userRequest);

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Agent request processing failed:', error);
            return `Agent 处理请求时出现错误: ${errorMessage}`;
        }
    }

    /**
     * 获取当前 Agent
     */
    getAgent(): BCoderAgent | null {
        return this.agent;
    }

    /**
     * 更新配置
     */
    updateConfig(updates: Partial<AgentConfig>): void {
        this.config = { ...this.config, ...updates };

        if (this.agent) {
            this.agent.updateConfig(this.config);
        }

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
        if (this.agent) {
            this.agent.stop();
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
