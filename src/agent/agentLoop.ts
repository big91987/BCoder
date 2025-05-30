import {
    Task,
    Plan,
    AgentState,
    AgentConfig,
    AgentCallbacks,
    AgentEvent,
    AgentEventType,
    Reflection
} from './types';
import { AgentMessage, MessageBuilder } from './messaging';
import { ContextManager } from './contextManager';
import { TaskPlanner } from './taskPlanner';
import { StepExecutor } from './stepExecutor';
import { ReflectionEngine } from './reflectionEngine';
import { ToolSystem } from '../tools';
import { AIClient } from '../utils/aiClient';
import { logger } from '../utils/logger';

/**
 * BCoder Agent - 实现观察-计划-执行-反思循环
 */
export class BCoderAgent {
    private contextManager: ContextManager;
    private taskPlanner: TaskPlanner;
    private stepExecutor: StepExecutor;
    private reflectionEngine: ReflectionEngine;
    private toolSystem: ToolSystem;
    private aiClient: AIClient;

    private state: AgentState;
    private config: AgentConfig;
    private callbacks: AgentCallbacks;
    private eventListeners: Map<AgentEventType, Function[]> = new Map();

    constructor(
        toolSystem: ToolSystem,
        aiClient: AIClient,
        workspaceRoot: string,
        config?: Partial<AgentConfig>,
        callbacks?: AgentCallbacks
    ) {
        this.toolSystem = toolSystem;
        this.aiClient = aiClient;

        // 初始化组件
        this.contextManager = new ContextManager(workspaceRoot);
        this.taskPlanner = new TaskPlanner(aiClient);
        this.stepExecutor = new StepExecutor(toolSystem);
        this.reflectionEngine = new ReflectionEngine(aiClient);

        // 初始化配置
        this.config = {
            maxStepsPerTask: 10,
            maxExecutionTime: 300000, // 5分钟
            enableReflection: true,
            autoApprove: false,
            riskTolerance: 'medium',
            debugMode: false,
            ...config
        };

        this.callbacks = callbacks || {};

        // 初始化状态
        this.state = {
            context: {
                workspaceRoot: workspaceRoot,
                activeFile: undefined,
                selectedText: undefined
            },
            executionHistory: [],
            isActive: false
        };

        logger.info('BCoder Agent initialized', {
            workspaceRoot,
            config: this.config
        });
    }

    /**
     * 处理用户请求 - 主要入口点
     */
    async processRequest(userRequest: string, callbacks?: AgentCallbacks): Promise<string> {
        // 临时合并回调
        const mergedCallbacks = { ...this.callbacks, ...callbacks };
        const requestId = `req_${Date.now()}`;
        logger.startTimer(requestId);
        logger.agentTaskStart(requestId, userRequest, {
            userRequest: userRequest.substring(0, 100)
        });

        try {
            // 1. 观察 (Observe) - 收集当前上下文
            logger.agentDebug('Starting observe phase', {}, `Task-${requestId}`);
            const context = await this.observe();
            logger.agentDebug('Observe phase completed', {
                workspaceRoot: context.workspaceRoot,
                activeFile: context.activeFile
            }, `Task-${requestId}`);

            // 2. 分析请求并创建任务
            logger.agentDebug('Starting task analysis', {}, `Task-${requestId}`);
            const task = await this.taskPlanner.analyzeRequest(userRequest, context);
            logger.agentDebug('Task analysis completed', {
                taskId: task.id,
                taskType: task.type,
                description: task.description
            }, `Task-${requestId}`);

            this.emitEvent('task_started', task);
            mergedCallbacks.onTaskStarted?.(task);

            // 3. 开始任务执行循环
            logger.agentDebug('Starting task execution loop', {}, `Task-${requestId}`);
            const reflection = await this.executeTaskLoop(task, context, mergedCallbacks);
            logger.agentDebug('Task execution loop completed', {
                success: reflection.success,
                resultsCount: reflection.results.length
            }, `Task-${requestId}`);

            // 4. 返回结果摘要
            const summary = this.generateResponseSummary(task, reflection);
            logger.agentTaskEnd(requestId, reflection.success, {
                summaryLength: summary.length
            });
            logger.endTimer(requestId, 'AgentRequest');

            return summary;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to process request:', error, { requestId });
            logger.agentTaskEnd(requestId, false, { error: errorMessage });
            logger.endTimer(requestId, 'AgentError');
            return `处理请求时出现错误: ${errorMessage}`;
        }
    }

    /**
     * 执行任务循环
     */
    private async executeTaskLoop(task: Task, initialContext: any, callbacks: AgentCallbacks): Promise<Reflection> {
        this.state.currentTask = task;
        this.state.isActive = true;

        let currentContext = initialContext;
        let iteration = 0;
        const maxIterations = 3; // 最大迭代次数

        while (iteration < maxIterations) {
            iteration++;
            logger.info(`Starting task iteration ${iteration} for task: ${task.id}`);

            try {
                // 1. 观察 (Observe) - 更新上下文
                currentContext = await this.observe();

                // 2. 计划 (Plan) - 创建或更新执行计划
                const plan = await this.plan(task, currentContext, callbacks);

                // 3. 执行 (Act) - 执行计划步骤
                const results = await this.act(plan, currentContext, callbacks);

                // 4. 反思 (Reflect) - 分析结果
                const reflection = await this.reflect(task, plan, results, currentContext);

                // 5. 决定是否继续
                if (!reflection.shouldContinue || reflection.success) {
                    this.state.isActive = false;
                    this.emitEvent('task_completed', { task, reflection });
                    callbacks.onTaskCompleted?.(task, reflection);
                    return reflection;
                }

                // 更新任务状态继续下一轮
                task.status = 'planning';

            } catch (error) {
                logger.error(`Task iteration ${iteration} failed:`, error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';

                this.state.isActive = false;
                this.emitEvent('task_failed', { task, error: errorMessage });
                callbacks.onTaskFailed?.(task, errorMessage);

                // 返回失败的反思
                return {
                    taskId: task.id,
                    planId: 'failed',
                    results: [],
                    success: false,
                    lessonsLearned: [`第${iteration}轮执行失败: ${errorMessage}`],
                    improvements: ['需要改进错误处理和恢复机制'],
                    shouldContinue: false,
                    nextActions: ['分析失败原因', '修复问题后重试']
                };
            }
        }

        // 达到最大迭代次数
        this.state.isActive = false;
        logger.warn(`Task ${task.id} reached maximum iterations (${maxIterations})`);

        return {
            taskId: task.id,
            planId: 'max_iterations',
            results: [],
            success: false,
            lessonsLearned: [`达到最大迭代次数 ${maxIterations}`],
            improvements: ['需要优化任务分解和执行策略'],
            shouldContinue: false,
            nextActions: ['重新分析任务需求', '简化执行步骤']
        };
    }

    /**
     * 观察阶段 - 收集当前上下文信息
     */
    private async observe(): Promise<any> {
        logger.debug('Observe phase: collecting context');

        const context = await this.contextManager.getContext();
        this.state.context = context;

        return context;
    }

    /**
     * 计划阶段 - 创建执行计划
     */
    private async plan(task: Task, context: any, callbacks: AgentCallbacks): Promise<Plan> {
        logger.debug('Plan phase: creating execution plan');

        task.status = 'planning';
        this.emitEvent('plan_created', { task });

        const plan = await this.taskPlanner.createPlan(task, context);
        this.state.currentPlan = plan;

        // 通知计划已创建
        callbacks.onPlanCreated?.(plan);

        // 风险评估
        if (plan.riskAssessment && plan.riskAssessment.level === 'high' && !this.config.autoApprove) {
            const approved = await this.requestUserApproval(
                `高风险操作需要确认: ${plan.riskAssessment.factors.join(', ')}`,
                { task, plan }
            );

            if (!approved) {
                throw new Error('用户取消了高风险操作');
            }
        }

        return plan;
    }

    /**
     * 执行阶段 - 执行计划步骤
     */
    private async act(plan: Plan, context: any, callbacks: AgentCallbacks): Promise<any[]> {
        logger.debug('Act phase: executing plan steps');

        const task = this.state.currentTask!;
        task.status = 'executing';

        // 限制步骤数量
        const steps = plan.steps.slice(0, this.config.maxStepsPerTask);

        const results = [];
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];

            this.emitEvent('step_started', step);
            callbacks.onStepStarted?.(step);

            const result = await this.stepExecutor.executeStep(step, context);
            results.push(result);
            this.state.executionHistory.push(result);

            if (result.success) {
                this.emitEvent('step_completed', { step, result });
                callbacks.onStepCompleted?.(step, result);
            } else {
                this.emitEvent('step_failed', { step, result });
                logger.warn(`Step failed: ${step.id} - ${result.error}`);
            }

            // 更新进度
            const progress = ((i + 1) / steps.length) * 100;
            callbacks.onProgress?.(progress, `执行步骤 ${i + 1}/${steps.length}`);
        }

        return results;
    }

    /**
     * 反思阶段 - 分析执行结果
     */
    private async reflect(task: Task, plan: Plan, results: any[], context: any): Promise<Reflection> {
        logger.debug('Reflect phase: analyzing results');

        task.status = 'reflecting';
        this.emitEvent('reflection_started', { task, plan, results });

        const reflection = await this.reflectionEngine.reflect(task, plan, results, context);
        this.state.lastReflection = reflection;

        this.emitEvent('reflection_completed', reflection);

        return reflection;
    }

    /**
     * 请求用户批准
     */
    private async requestUserApproval(reason: string, context: any): Promise<boolean> {
        if (this.callbacks.onUserInterventionRequired) {
            return await this.callbacks.onUserInterventionRequired(reason, context);
        }

        // 默认拒绝高风险操作
        return false;
    }

    /**
     * 生成响应摘要 - 协同工作风格
     */
    private generateResponseSummary(task: Task, reflection: Reflection): string {
        if (reflection.success) {
            // 成功时简洁回复，专注于结果
            const results = reflection.results.filter(r => r.success && r.data);

            if (results.length > 0) {
                // 如果有具体结果数据，展示关键信息
                const mainResult = results[0];
                if (mainResult.data && typeof mainResult.data === 'string') {
                    return `✅ 已完成：${task.description}\n\n${mainResult.data}`;
                } else if (mainResult.data && typeof mainResult.data === 'object') {
                    // 对象数据简化显示
                    const preview = JSON.stringify(mainResult.data, null, 2).substring(0, 500);
                    return `✅ 已完成：${task.description}\n\n\`\`\`\n${preview}${preview.length >= 500 ? '\n...' : ''}\n\`\`\``;
                }
            }

            // 默认成功消息
            return `✅ 已完成：${task.description}`;
        } else {
            // 失败时提供简洁的错误信息和建议
            const failedResults = reflection.results.filter(r => !r.success);
            const errorMsg = failedResults.length > 0 ? failedResults[0].error : '未知错误';

            let summary = `❌ 执行失败：${task.description}\n\n`;
            summary += `错误：${errorMsg}\n`;

            // 只在有明确后续行动时才显示建议
            if (reflection.nextActions && reflection.nextActions.length > 0) {
                summary += `\n💡 建议：${reflection.nextActions[0]}`;
            }

            return summary.trim();
        }
    }

    /**
     * 发出事件
     */
    private emitEvent(type: AgentEventType, data: any): void {
        const event: AgentEvent = {
            type,
            timestamp: new Date(),
            data
        };

        const listeners = this.eventListeners.get(type) || [];
        listeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                logger.warn(`Event listener error for ${type}:`, error);
            }
        });
    }

    /**
     * 添加事件监听器
     */
    addEventListener(type: AgentEventType, listener: Function): void {
        if (!this.eventListeners.has(type)) {
            this.eventListeners.set(type, []);
        }
        this.eventListeners.get(type)!.push(listener);
    }

    /**
     * 移除事件监听器
     */
    removeEventListener(type: AgentEventType, listener: Function): void {
        const listeners = this.eventListeners.get(type);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * 获取当前状态
     */
    getState(): AgentState {
        return { ...this.state };
    }

    /**
     * 获取配置
     */
    getConfig(): AgentConfig {
        return { ...this.config };
    }

    /**
     * 更新配置
     */
    updateConfig(updates: Partial<AgentConfig>): void {
        this.config = { ...this.config, ...updates };
        logger.info('Agent config updated:', updates);
    }

    /**
     * 停止当前任务
     */
    stop(): void {
        this.state.isActive = false;
        logger.info('Agent stopped');
    }

    /**
     * 清理资源
     */
    dispose(): void {
        this.stop();
        this.eventListeners.clear();
        this.contextManager.clearCache();
        logger.info('Agent disposed');
    }
}
