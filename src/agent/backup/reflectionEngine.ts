import { Task, Plan, ActionResult, Reflection, AgentContext } from './types';
import { AIClient } from '../utils/aiClient';
import { logger } from '../utils/logger';

/**
 * 反思引擎 - 负责分析执行结果并提供改进建议
 */
export class ReflectionEngine {
    private aiClient: AIClient;

    constructor(aiClient: AIClient) {
        this.aiClient = aiClient;
    }

    /**
     * 对任务执行结果进行反思
     */
    async reflect(
        task: Task,
        plan: Plan,
        results: ActionResult[],
        context: AgentContext
    ): Promise<Reflection> {
        logger.info(`Starting reflection for task: ${task.id}`);

        const executionStats = this.calculateExecutionStats(results);
        const success = this.determineOverallSuccess(results, task);

        // 生成反思提示词
        const reflectionPrompt = this.buildReflectionPrompt(task, plan, results, context, executionStats);

        try {
            // 调用AI进行反思分析
            const aiReflection = await this.aiClient.chat(reflectionPrompt);
            const parsedReflection = this.parseReflectionResponse(aiReflection);

            const reflection: Reflection = {
                taskId: task.id,
                planId: plan.id,
                results: results,
                success: success,
                lessonsLearned: parsedReflection.lessonsLearned || this.generateDefaultLessons(results),
                improvements: parsedReflection.improvements || this.generateDefaultImprovements(results),
                shouldContinue: this.shouldContinueExecution(results, task),
                nextActions: parsedReflection.nextActions || this.suggestNextActions(results, task)
            };

            logger.info(`Reflection completed for task: ${task.id}`, {
                success: reflection.success,
                lessonsCount: reflection.lessonsLearned.length,
                improvementsCount: reflection.improvements.length
            });

            return reflection;
        } catch (error) {
            logger.error('Failed to generate AI reflection, using fallback:', error);
            return this.generateFallbackReflection(task, plan, results);
        }
    }

    /**
     * 计算执行统计
     */
    private calculateExecutionStats(results: ActionResult[]): {
        total: number;
        successful: number;
        failed: number;
        successRate: number;
        totalDuration: number;
        averageDuration: number;
    } {
        const total = results.length;
        const successful = results.filter(r => r.success).length;
        const failed = total - successful;
        const successRate = total > 0 ? successful / total : 0;
        const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
        const averageDuration = total > 0 ? totalDuration / total : 0;

        return {
            total,
            successful,
            failed,
            successRate,
            totalDuration,
            averageDuration
        };
    }

    /**
     * 确定整体成功状态
     */
    private determineOverallSuccess(results: ActionResult[], task: Task): boolean {
        if (results.length === 0) {
            return false;
        }

        // 对于关键任务，所有步骤都必须成功
        if (task.priority === 'critical') {
            return results.every(r => r.success);
        }

        // 对于其他任务，大部分步骤成功即可
        const successRate = results.filter(r => r.success).length / results.length;
        return successRate >= 0.7; // 70%成功率
    }

    /**
     * 构建反思提示词
     */
    private buildReflectionPrompt(
        task: Task,
        plan: Plan,
        results: ActionResult[],
        context: AgentContext,
        stats: any
    ): string {
        return `
请对以下任务执行进行深度反思和分析：

## 任务信息
- 任务ID: ${task.id}
- 描述: ${task.description}
- 类型: ${task.type}
- 优先级: ${task.priority}

## 执行计划
- 计划ID: ${plan.id}
- 总步骤数: ${plan.steps.length}
- 预估时间: ${plan.estimatedDuration}ms

## 执行结果统计
- 总步骤: ${stats.total}
- 成功: ${stats.successful}
- 失败: ${stats.failed}
- 成功率: ${(stats.successRate * 100).toFixed(1)}%
- 总耗时: ${stats.totalDuration}ms
- 平均耗时: ${stats.averageDuration.toFixed(0)}ms

## 详细执行结果
${results.map((result, index) => `
步骤 ${index + 1}: ${result.stepId}
- 状态: ${result.success ? '✅ 成功' : '❌ 失败'}
- 耗时: ${result.duration}ms
${result.error ? `- 错误: ${result.error}` : ''}
${result.sideEffects ? `- 副作用: ${result.sideEffects.join(', ')}` : ''}
`).join('')}

## 工作区上下文
- 根目录: ${context.workspaceRoot}
- 当前文件: ${context.activeFile || '无'}
- 项目类型: ${context.projectStructure?.type || '未知'}

请从以下角度进行反思分析，并以JSON格式返回：

{
  "lessonsLearned": [
    "从这次执行中学到的经验教训"
  ],
  "improvements": [
    "下次可以改进的地方"
  ],
  "nextActions": [
    "建议的后续行动"
  ]
}

重点关注：
1. 哪些步骤执行得好，为什么？
2. 哪些步骤失败了，根本原因是什么？
3. 计划是否合理，是否有遗漏或冗余？
4. 工具选择是否恰当？
5. 参数设置是否正确？
6. 如何提高执行效率和成功率？
`;
    }

    /**
     * 解析反思响应
     */
    private parseReflectionResponse(response: string): {
        lessonsLearned?: string[];
        improvements?: string[];
        nextActions?: string[];
    } {
        try {
            // 尝试提取JSON部分
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            // 如果没有JSON，尝试解析文本格式
            return this.parseTextReflection(response);
        } catch (error) {
            logger.warn('Failed to parse reflection response:', error);
            return {};
        }
    }

    /**
     * 解析文本格式的反思
     */
    private parseTextReflection(response: string): {
        lessonsLearned?: string[];
        improvements?: string[];
        nextActions?: string[];
    } {
        const result: any = {};

        // 提取经验教训
        const lessonsMatch = response.match(/经验教训[：:]([\s\S]*?)(?=改进|后续|$)/i);
        if (lessonsMatch) {
            result.lessonsLearned = this.extractListItems(lessonsMatch[1]);
        }

        // 提取改进建议
        const improvementsMatch = response.match(/改进[：:]([\s\S]*?)(?=后续|经验|$)/i);
        if (improvementsMatch) {
            result.improvements = this.extractListItems(improvementsMatch[1]);
        }

        // 提取后续行动
        const actionsMatch = response.match(/后续[：:]([\s\S]*?)(?=改进|经验|$)/i);
        if (actionsMatch) {
            result.nextActions = this.extractListItems(actionsMatch[1]);
        }

        return result;
    }

    /**
     * 从文本中提取列表项
     */
    private extractListItems(text: string): string[] {
        return text
            .split(/[•\-\*\n]/)
            .map(item => item.trim())
            .filter(item => item.length > 0)
            .slice(0, 5); // 限制数量
    }

    /**
     * 生成默认经验教训
     */
    private generateDefaultLessons(results: ActionResult[]): string[] {
        const lessons: string[] = [];

        const failedResults = results.filter(r => !r.success);
        const successfulResults = results.filter(r => r.success);

        if (successfulResults.length > 0) {
            lessons.push(`成功执行了 ${successfulResults.length} 个步骤`);
        }

        if (failedResults.length > 0) {
            lessons.push(`${failedResults.length} 个步骤失败，需要改进错误处理`);
        }

        const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
        if (avgDuration > 5000) {
            lessons.push('执行时间较长，可以考虑优化性能');
        }

        return lessons;
    }

    /**
     * 生成默认改进建议
     */
    private generateDefaultImprovements(results: ActionResult[]): string[] {
        const improvements: string[] = [];

        const failedResults = results.filter(r => !r.success);

        if (failedResults.length > 0) {
            improvements.push('加强参数验证和错误处理');
            improvements.push('在执行前进行更充分的准备工作');
        }

        if (results.some(r => r.sideEffects && r.sideEffects.length > 0)) {
            improvements.push('更好地管理和预测副作用');
        }

        improvements.push('优化步骤顺序和依赖关系');

        return improvements;
    }

    /**
     * 判断是否应该继续执行
     */
    private shouldContinueExecution(results: ActionResult[], task: Task): boolean {
        // 如果有未完成的子任务，可以继续
        if (task.subtasks && task.subtasks.some(subtask => subtask.status !== 'completed')) {
            return true;
        }

        // 如果失败率太高，不建议继续
        const failureRate = results.filter(r => !r.success).length / results.length;
        if (failureRate > 0.5) {
            return false;
        }

        return false; // 默认不继续
    }

    /**
     * 建议后续行动
     */
    private suggestNextActions(results: ActionResult[], task: Task): string[] {
        const actions: string[] = [];

        const failedResults = results.filter(r => !r.success);

        if (failedResults.length > 0) {
            actions.push('分析失败原因并修复问题');
            actions.push('重新执行失败的步骤');
        }

        if (task.type === 'feature_implementation') {
            actions.push('编写测试用例验证功能');
            actions.push('更新相关文档');
        }

        if (task.type === 'bug_fix') {
            actions.push('验证问题是否已解决');
            actions.push('添加回归测试');
        }

        return actions;
    }

    /**
     * 生成备用反思（当AI反思失败时）
     */
    private generateFallbackReflection(task: Task, plan: Plan, results: ActionResult[]): Reflection {
        return {
            taskId: task.id,
            planId: plan.id,
            results: results,
            success: this.determineOverallSuccess(results, task),
            lessonsLearned: this.generateDefaultLessons(results),
            improvements: this.generateDefaultImprovements(results),
            shouldContinue: this.shouldContinueExecution(results, task),
            nextActions: this.suggestNextActions(results, task)
        };
    }

    /**
     * 获取反思摘要
     */
    getReflectionSummary(reflection: Reflection): string {
        const status = reflection.success ? '✅ 成功' : '❌ 失败';
        const successRate = reflection.results.length > 0
            ? (reflection.results.filter(r => r.success).length / reflection.results.length * 100).toFixed(1)
            : '0';

        return `
任务执行反思摘要:
- 状态: ${status}
- 成功率: ${successRate}%
- 经验教训: ${reflection.lessonsLearned.length} 条
- 改进建议: ${reflection.improvements.length} 条
- 后续行动: ${reflection.nextActions?.length || 0} 条
- 建议继续: ${reflection.shouldContinue ? '是' : '否'}
`;
    }
}
