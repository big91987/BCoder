import { Task, Plan, PlanStep, TaskType, TaskPriority, AgentContext, RiskAssessment, ActionType } from './types';
import { AIClient } from '../utils/aiClient';
import { logger } from '../utils/logger';

/**
 * 任务规划器 - 负责将用户请求分解为可执行的计划
 */
export class TaskPlanner {
    private aiClient: AIClient;
    private planCounter = 0;
    private taskCounter = 0;

    constructor(aiClient: AIClient) {
        this.aiClient = aiClient;
    }

    /**
     * 分析用户请求并创建任务
     */
    async analyzeRequest(userRequest: string, context: AgentContext): Promise<Task> {
        logger.info('Analyzing user request:', userRequest);

        const taskType = this.determineTaskType(userRequest);
        const priority = this.determinePriority(userRequest, taskType);

        const task: Task = {
            id: `task_${++this.taskCounter}`,
            description: userRequest,
            type: taskType,
            priority: priority,
            status: 'pending',
            context: {
                originalRequest: userRequest,
                workspaceContext: context
            }
        };

        // 对于复杂任务，进行分解
        if (this.isComplexTask(userRequest)) {
            task.subtasks = await this.decomposeTask(userRequest, context);
            task.estimatedSteps = task.subtasks.reduce((sum, subtask) =>
                sum + (subtask.estimatedSteps || 1), 0);
        } else {
            task.estimatedSteps = this.estimateSteps(userRequest, taskType);
        }

        logger.info(`Task created: ${task.id} (${task.type}, ${task.priority})`);
        return task;
    }

    /**
     * 为任务创建执行计划
     */
    async createPlan(task: Task, context: AgentContext): Promise<Plan> {
        logger.info(`Creating plan for task: ${task.id}`);

        const planPrompt = this.buildPlanningPrompt(task, context);
        const planResponse = await this.aiClient.chat(planPrompt);

        const steps = await this.parsePlanSteps(planResponse, task, context);
        const requiredTools = this.extractRequiredTools(steps);
        const riskAssessment = this.assessRisk(task, steps);

        const plan: Plan = {
            id: `plan_${++this.planCounter}`,
            taskId: task.id,
            steps: steps,
            estimatedDuration: this.estimateDuration(steps),
            requiredTools: requiredTools,
            riskAssessment: riskAssessment
        };

        logger.info(`Plan created: ${plan.id} with ${plan.steps.length} steps`);
        return plan;
    }

    /**
     * 确定任务类型
     */
    private determineTaskType(userRequest: string): TaskType {
        const request = userRequest.toLowerCase();

        if (request.includes('bug') || request.includes('fix') || request.includes('error')) {
            return 'bug_fix';
        } else if (request.includes('test') || request.includes('测试')) {
            return 'testing';
        } else if (request.includes('refactor') || request.includes('重构')) {
            return 'refactoring';
        } else if (request.includes('document') || request.includes('文档')) {
            return 'documentation';
        } else if (request.includes('analyze') || request.includes('分析')) {
            return 'analysis';
        } else if (request.includes('review') || request.includes('审查')) {
            return 'code_review';
        } else {
            return 'feature_implementation';
        }
    }

    /**
     * 确定任务优先级
     */
    private determinePriority(userRequest: string, taskType: TaskType): TaskPriority {
        const request = userRequest.toLowerCase();

        if (request.includes('urgent') || request.includes('critical') ||
            request.includes('紧急') || request.includes('严重')) {
            return 'critical';
        } else if (request.includes('important') || request.includes('high') ||
                   request.includes('重要') || taskType === 'bug_fix') {
            return 'high';
        } else if (request.includes('low') || request.includes('minor') ||
                   request.includes('低') || taskType === 'documentation') {
            return 'low';
        } else {
            return 'medium';
        }
    }

    /**
     * 判断是否为复杂任务
     */
    private isComplexTask(userRequest: string): boolean {
        const complexIndicators = [
            'implement', 'create', 'build', 'develop',
            '实现', '创建', '构建', '开发',
            'multiple', 'several', 'various',
            '多个', '几个', '各种'
        ];

        const request = userRequest.toLowerCase();
        return complexIndicators.some(indicator => request.includes(indicator)) ||
               userRequest.length > 100; // 长请求通常更复杂
    }

    /**
     * 分解复杂任务
     */
    private async decomposeTask(userRequest: string, context: AgentContext): Promise<Task[]> {
        const decompositionPrompt = `
请将以下复杂任务分解为更小的子任务：

任务描述: ${userRequest}

工作区上下文:
${JSON.stringify(context, null, 2)}

请返回一个JSON数组，每个元素包含：
- description: 子任务描述
- type: 任务类型 (bug_fix, feature_implementation, testing, etc.)
- estimatedSteps: 预估步骤数

示例格式:
[
  {
    "description": "分析现有代码结构",
    "type": "analysis",
    "estimatedSteps": 2
  },
  {
    "description": "实现核心功能",
    "type": "feature_implementation",
    "estimatedSteps": 5
  }
]
`;

        try {
            const response = await this.aiClient.chat(decompositionPrompt);
            const subtasksData = this.parseJsonResponse(response);

            return subtasksData.map((data: any, index: number) => ({
                id: `subtask_${this.taskCounter}_${index + 1}`,
                description: data.description,
                type: data.type || 'feature_implementation',
                priority: 'medium' as TaskPriority,
                status: 'pending' as const,
                estimatedSteps: data.estimatedSteps || 1
            }));
        } catch (error) {
            logger.warn('Failed to decompose task, using simple decomposition:', error);
            return this.simpleTaskDecomposition(userRequest);
        }
    }

    /**
     * 简单任务分解（备用方案）
     */
    private simpleTaskDecomposition(userRequest: string): Task[] {
        return [
            {
                id: `subtask_${this.taskCounter}_1`,
                description: `分析需求: ${userRequest}`,
                type: 'analysis',
                priority: 'medium',
                status: 'pending',
                estimatedSteps: 1
            },
            {
                id: `subtask_${this.taskCounter}_2`,
                description: `实现功能: ${userRequest}`,
                type: 'feature_implementation',
                priority: 'medium',
                status: 'pending',
                estimatedSteps: 3
            },
            {
                id: `subtask_${this.taskCounter}_3`,
                description: `测试和验证`,
                type: 'testing',
                priority: 'medium',
                status: 'pending',
                estimatedSteps: 1
            }
        ];
    }

    /**
     * 构建规划提示词
     */
    private buildPlanningPrompt(task: Task, context: AgentContext): string {
        return `
任务: ${task.description}

工作区: ${context.workspaceRoot}

可用工具:
- read_file: 读取文件内容，参数: {"path": "文件路径"}
- write_file: 写入文件，参数: {"path": "文件路径", "content": "文件内容"}
- edit_file: 编辑文件，参数: {"path": "文件路径", "old_text": "要替换的文本", "new_text": "新文本"}
- list_files: 列出目录，参数: {"path": "目录路径", "recursive": true/false}
- search_files: 搜索文件，参数: {"pattern": "*.js", "directory": "目录", "recursive": true}
- search_in_files: 搜索内容，参数: {"query": "搜索词", "directory": "目录", "file_pattern": "*.js"}

请直接返回执行步骤的JSON数组，不要其他解释：

示例1 - 如果用户说"读取package.json文件":
[{"description": "读取package.json文件", "action": "read_file", "tools": ["read_file"], "parameters": {"path": "package.json"}}]

示例2 - 如果用户说"创建hello.js文件":
[{"description": "创建hello.js文件", "action": "write_file", "tools": ["write_file"], "parameters": {"path": "hello.js", "content": "console.log('Hello World');"}}]

示例3 - 如果用户说"列出src目录":
[{"description": "列出src目录文件", "action": "list_files", "tools": ["list_files"], "parameters": {"path": "src", "recursive": false}}]

现在为这个任务创建执行步骤:
`;
    }

    /**
     * 解析计划步骤
     */
    private async parsePlanSteps(planResponse: string, task: Task, context: AgentContext): Promise<PlanStep[]> {
        try {
            const stepsData = this.parseJsonResponse(planResponse);

            return stepsData.map((data: any, index: number) => ({
                id: `step_${task.id}_${index + 1}`,
                description: data.description,
                action: data.action || 'read_file',
                tools: Array.isArray(data.tools) ? data.tools : [data.action || 'read_file'],
                parameters: data.parameters || {},
                dependencies: data.dependencies || []
            }));
        } catch (error) {
            logger.warn('Failed to parse plan steps, using default plan:', error);
            return this.createDefaultPlan(task);
        }
    }

    /**
     * 创建默认计划（备用方案）
     */
    private createDefaultPlan(task: Task): PlanStep[] {
        const steps: PlanStep[] = [];

        // 根据任务类型创建基本步骤
        switch (task.type) {
            case 'bug_fix':
                steps.push(
                    {
                        id: `step_${task.id}_1`,
                        description: '分析问题和相关代码',
                        action: 'search_in_files',
                        tools: ['search_in_files', 'read_file'],
                        parameters: {}
                    },
                    {
                        id: `step_${task.id}_2`,
                        description: '修复代码问题',
                        action: 'edit_file',
                        tools: ['edit_file'],
                        parameters: {}
                    }
                );
                break;

            case 'feature_implementation':
                steps.push(
                    {
                        id: `step_${task.id}_1`,
                        description: '分析现有代码结构',
                        action: 'list_files',
                        tools: ['list_files', 'read_file'],
                        parameters: {}
                    },
                    {
                        id: `step_${task.id}_2`,
                        description: '实现新功能',
                        action: 'write_file',
                        tools: ['write_file', 'edit_file'],
                        parameters: {}
                    }
                );
                break;

            default:
                steps.push({
                    id: `step_${task.id}_1`,
                    description: '执行任务',
                    action: 'read_file',
                    tools: ['read_file'],
                    parameters: {}
                });
        }

        return steps;
    }

    /**
     * 提取所需工具
     */
    private extractRequiredTools(steps: PlanStep[]): string[] {
        const tools = new Set<string>();
        steps.forEach(step => {
            step.tools.forEach(tool => tools.add(tool));
        });
        return Array.from(tools);
    }

    /**
     * 评估风险
     */
    private assessRisk(task: Task, steps: PlanStep[]): RiskAssessment {
        const riskFactors: string[] = [];
        let riskLevel: 'low' | 'medium' | 'high' = 'low';

        // 检查文件操作风险
        const hasFileWrites = steps.some(step =>
            step.tools.includes('write_file') ||
            step.tools.includes('edit_file') ||
            step.tools.includes('delete_file')
        );

        if (hasFileWrites) {
            riskFactors.push('包含文件修改操作');
            riskLevel = 'medium';
        }

        // 检查任务复杂度
        if (steps.length > 5) {
            riskFactors.push('步骤较多，执行复杂');
            riskLevel = 'medium';
        }

        // 检查任务类型风险
        if (task.type === 'refactoring') {
            riskFactors.push('重构操作可能影响现有功能');
            riskLevel = 'high';
        }

        const mitigations = [
            '执行前进行备份',
            '逐步执行并验证',
            '出现问题时及时回滚'
        ];

        return {
            level: riskLevel,
            factors: riskFactors,
            mitigations: mitigations
        };
    }

    /**
     * 估算执行时间
     */
    private estimateDuration(steps: PlanStep[]): number {
        // 简单估算：每个步骤平均30秒
        return steps.length * 30000; // 毫秒
    }

    /**
     * 估算步骤数
     */
    private estimateSteps(userRequest: string, taskType: TaskType): number {
        const baseSteps = {
            'bug_fix': 2,
            'feature_implementation': 3,
            'testing': 2,
            'refactoring': 4,
            'documentation': 1,
            'analysis': 1,
            'code_review': 2
        };

        let steps = baseSteps[taskType] || 2;

        // 根据请求长度调整
        if (userRequest.length > 100) {
            steps += 1;
        }
        if (userRequest.length > 200) {
            steps += 1;
        }

        return steps;
    }

    /**
     * 解析JSON响应
     */
    private parseJsonResponse(response: string): any[] {
        try {
            // 尝试提取JSON部分
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            // 如果没有找到JSON，返回空数组
            return [];
        } catch (error) {
            logger.warn('Failed to parse JSON response:', error);
            return [];
        }
    }
}
