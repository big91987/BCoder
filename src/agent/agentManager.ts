import { IAgent, IAgentFactory, IAgentManager, AgentConfig } from './agentInterface';
import { BCoderAgent } from './bcoderAgent';
import { logger } from '../utils/logger';

/**
 * BCoder Agent 工厂
 */
export class BCoderAgentFactory implements IAgentFactory {
    private context: any;

    constructor(context: any) {
        this.context = context;
    }

    async createAgent(config?: Record<string, any>): Promise<IAgent> {
        const agent = new BCoderAgent();

        // 调试：检查传递给 Agent 的 context
        const finalContext = { ...this.context, ...config };
        logger.info('🔍 BCoderAgentFactory context debug:');
        logger.info(`Factory context keys: ${Object.keys(this.context)}`);
        logger.info(`Config keys: ${config ? Object.keys(config) : 'none'}`);
        logger.info(`Final context keys: ${Object.keys(finalContext)}`);
        logger.info(`Has aiClient: ${!!finalContext.aiClient}`);
        logger.info(`Has toolSystem: ${!!finalContext.toolSystem}`);

        await agent.initialize(finalContext);
        return agent;
    }

    getSupportedTypes(): string[] {
        return ['bcoder'];
    }
}

/**
 * Agent 管理器实现
 * 负责管理所有 Agent 的创建、切换和生命周期
 */
export class AgentManager implements IAgentManager {
    private factories = new Map<string, IAgentFactory>();
    private currentAgent: IAgent | null = null;
    private defaultAgentType = 'bcoder';

    constructor() {
        logger.info('🏭 AgentManager initialized');
    }

    registerAgentFactory(type: string, factory: IAgentFactory): void {
        this.factories.set(type, factory);
        logger.info(`📝 Registered agent factory: ${type}`);
    }

    async createAgent(type: string, config?: Record<string, any>): Promise<IAgent> {
        const factory = this.factories.get(type);
        if (!factory) {
            throw new Error(`Agent factory not found for type: ${type}`);
        }

        logger.info(`🏗️ Creating agent of type: ${type}`);
        const agent = await factory.createAgent(config);
        logger.info(`✅ Agent created successfully: ${agent.config.name}`);

        return agent;
    }

    getCurrentAgent(): IAgent | null {
        return this.currentAgent;
    }

    async switchAgent(type: string, config?: Record<string, any>): Promise<void> {
        logger.info(`🔄 Switching to agent type: ${type}`);

        // 停止并清理当前 Agent
        if (this.currentAgent) {
            await this.currentAgent.stop();
            await this.currentAgent.dispose();
            logger.info(`🛑 Previous agent disposed: ${this.currentAgent.config.name}`);
        }

        // 创建新 Agent
        this.currentAgent = await this.createAgent(type, config);
        logger.info(`✅ Switched to agent: ${this.currentAgent.config.name}`);
    }

    getAvailableAgents(): Array<{ type: string; config: AgentConfig }> {
        const agents: Array<{ type: string; config: AgentConfig }> = [];

        for (const [type, factory] of this.factories) {
            // 为了获取配置，我们需要创建一个临时实例
            // 在实际实现中，可能需要工厂提供配置信息的方法
            if (type === 'bcoder') {
                agents.push({
                    type,
                    config: {
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
                    }
                });
            }
        }

        return agents;
    }

    /**
     * 初始化默认 Agent
     */
    async initializeDefault(context: any): Promise<void> {
        // 注册默认的 BCoder Agent 工厂
        this.registerAgentFactory('bcoder', new BCoderAgentFactory(context));

        if (!this.currentAgent) {
            await this.switchAgent(this.defaultAgentType, context);
        }
    }

    /**
     * 获取当前 Agent 状态
     */
    getCurrentStatus() {
        if (!this.currentAgent) {
            return { hasAgent: false };
        }

        return {
            hasAgent: true,
            agentType: this.getAgentType(this.currentAgent),
            agentName: this.currentAgent.config.name,
            status: this.currentAgent.getStatus()
        };
    }

    /**
     * 根据 Agent 实例获取类型
     */
    private getAgentType(agent: IAgent): string {
        // 简单的类型推断，实际实现中可能需要更复杂的逻辑
        if (agent instanceof BCoderAgent) {
            return 'bcoder';
        }
        return 'unknown';
    }

    /**
     * 清理所有资源
     */
    async dispose(): Promise<void> {
        if (this.currentAgent) {
            await this.currentAgent.stop();
            await this.currentAgent.dispose();
            this.currentAgent = null;
        }

        this.factories.clear();
        logger.info('🗑️ AgentManager disposed');
    }
}
