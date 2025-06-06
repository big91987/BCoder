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

        // 初始化新的 AgentManager（异步）
        this.initializeAgentManager().catch(error => {
            logger.error('Failed to initialize AgentManager in constructor:', error);
        });

        logger.info('Agent system initialized (legacy wrapper)');
    }

    private async initializeAgentManager() {
        try {
            const { AgentManager } = require('./agentManager');
            this.agentManager = new AgentManager();
            await this.agentManager.initializeDefault({
                toolSystem: this.toolSystem,
                agentSystem: this,
                aiClient: this.aiClient
            });
        } catch (error) {
            logger.error('Failed to initialize AgentManager:', error);
        }
    }

    /**
     * 处理用户请求 - 使用新的 AgentManager
     */
    async processRequest(userRequest: string, callbacks?: AgentCallbacks): Promise<string> {
        try {
            if (!this.agentManager) {
                logger.info('AgentManager not initialized, initializing now...');
                await this.initializeAgentManager();
            }

            // 调试：检查 agentManager 状态
            logger.info('🔍 AgentManager debug:');
            logger.info(`agentManager exists: ${!!this.agentManager}`);
            logger.info(`agentManager type: ${typeof this.agentManager}`);
            logger.info(`agentManager constructor: ${this.agentManager?.constructor?.name}`);
            logger.info(`getCurrentAgent method exists: ${typeof this.agentManager?.getCurrentAgent}`);

            if (!this.agentManager) {
                throw new Error('Failed to initialize AgentManager');
            }

            if (typeof this.agentManager.getCurrentAgent !== 'function') {
                throw new Error(`AgentManager.getCurrentAgent is not a function, it's ${typeof this.agentManager.getCurrentAgent}`);
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
     * 获取 AgentManager 实例
     */
    getAgentManager(): any {
        return this.agentManager;
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
     * 清理资源
     */
    dispose(): void {
        if (this.agentManager) {
            this.agentManager.dispose();
            this.agentManager = null;
        }
        logger.info('Agent system disposed');
    }
}

// 导出新架构的接口
export * from './agentInterface';
export * from './agentManager';
export * from './bcoderReactAgent';
