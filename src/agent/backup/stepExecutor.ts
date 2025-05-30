import { PlanStep, ActionResult, AgentContext, ValidationCriteria } from './types';
import { ToolSystem } from '../tools';
import { logger } from '../utils/logger';

/**
 * 步骤执行器 - 负责执行计划中的具体步骤
 */
export class StepExecutor {
    private toolSystem: ToolSystem;

    constructor(toolSystem: ToolSystem) {
        this.toolSystem = toolSystem;
    }

    /**
     * 执行单个步骤
     */
    async executeStep(step: PlanStep, context: AgentContext): Promise<ActionResult> {
        const startTime = Date.now();
        logger.info(`Executing step: ${step.id} - ${step.description}`);

        try {
            // 预处理参数
            const processedParameters = await this.preprocessParameters(step.parameters, context);
            
            // 执行主要工具
            const toolResult = await this.toolSystem.executeTool(step.action, processedParameters);
            
            const duration = Date.now() - startTime;
            
            if (toolResult.success) {
                // 验证执行结果
                const validationResult = await this.validateResult(step, toolResult, context);
                
                if (validationResult.isValid) {
                    logger.info(`Step completed successfully: ${step.id}`);
                    
                    return {
                        stepId: step.id,
                        success: true,
                        data: toolResult.data,
                        duration: duration,
                        sideEffects: await this.detectSideEffects(step, toolResult, context)
                    };
                } else {
                    logger.warn(`Step validation failed: ${step.id} - ${validationResult.reason}`);
                    
                    return {
                        stepId: step.id,
                        success: false,
                        error: `Validation failed: ${validationResult.reason}`,
                        duration: duration
                    };
                }
            } else {
                logger.error(`Step execution failed: ${step.id} - ${toolResult.error}`);
                
                return {
                    stepId: step.id,
                    success: false,
                    error: toolResult.error,
                    duration: duration
                };
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            logger.error(`Step execution error: ${step.id}`, error);
            
            return {
                stepId: step.id,
                success: false,
                error: errorMessage,
                duration: duration
            };
        }
    }

    /**
     * 批量执行步骤
     */
    async executeSteps(steps: PlanStep[], context: AgentContext): Promise<ActionResult[]> {
        const results: ActionResult[] = [];
        
        for (const step of steps) {
            // 检查依赖关系
            const dependenciesMet = await this.checkDependencies(step, results);
            
            if (!dependenciesMet) {
                results.push({
                    stepId: step.id,
                    success: false,
                    error: 'Dependencies not met',
                    duration: 0
                });
                continue;
            }
            
            // 执行步骤
            const result = await this.executeStep(step, context);
            results.push(result);
            
            // 如果步骤失败，根据策略决定是否继续
            if (!result.success) {
                const shouldContinue = await this.handleStepFailure(step, result, context);
                if (!shouldContinue) {
                    logger.info('Stopping execution due to step failure');
                    break;
                }
            }
            
            // 更新上下文（如果需要）
            await this.updateContextAfterStep(step, result, context);
        }
        
        return results;
    }

    /**
     * 预处理参数
     */
    private async preprocessParameters(parameters: Record<string, any>, context: AgentContext): Promise<Record<string, any>> {
        const processed = { ...parameters };
        
        // 处理特殊占位符
        for (const [key, value] of Object.entries(processed)) {
            if (typeof value === 'string') {
                // 替换工作区路径占位符
                processed[key] = value.replace('${workspaceRoot}', context.workspaceRoot);
                
                // 替换当前文件占位符
                if (context.activeFile) {
                    processed[key] = processed[key].replace('${activeFile}', context.activeFile);
                }
                
                // 替换选中文本占位符
                if (context.selectedText) {
                    processed[key] = processed[key].replace('${selectedText}', context.selectedText);
                }
            }
        }
        
        return processed;
    }

    /**
     * 验证执行结果
     */
    private async validateResult(
        step: PlanStep, 
        toolResult: any, 
        context: AgentContext
    ): Promise<{ isValid: boolean; reason?: string }> {
        // 如果没有验证条件，默认通过
        if (!step.validation) {
            return { isValid: true };
        }
        
        const validation = step.validation;
        
        switch (validation.type) {
            case 'file_exists':
                const filePath = validation.parameters?.path || toolResult.data?.path;
                if (!filePath) {
                    return { isValid: false, reason: 'No file path to validate' };
                }
                
                try {
                    const fileInfo = await this.toolSystem.executeTool('get_file_info', { path: filePath });
                    return { 
                        isValid: fileInfo.success, 
                        reason: fileInfo.success ? undefined : 'File does not exist' 
                    };
                } catch (error) {
                    return { isValid: false, reason: 'Failed to check file existence' };
                }
                
            case 'code_compiles':
                // 这里可以集成编译检查逻辑
                // 暂时返回true，实际实现需要调用编译器
                return { isValid: true };
                
            case 'tests_pass':
                // 这里可以集成测试运行逻辑
                // 暂时返回true，实际实现需要运行测试
                return { isValid: true };
                
            case 'no_errors':
                // 检查是否有编译错误
                const hasErrors = context.diagnostics?.some(d => d.severity === 'error') || false;
                return { 
                    isValid: !hasErrors, 
                    reason: hasErrors ? 'Code has compilation errors' : undefined 
                };
                
            default:
                return { isValid: true };
        }
    }

    /**
     * 检查步骤依赖关系
     */
    private async checkDependencies(step: PlanStep, previousResults: ActionResult[]): Promise<boolean> {
        if (!step.dependencies || step.dependencies.length === 0) {
            return true;
        }
        
        for (const dependencyId of step.dependencies) {
            const dependencyResult = previousResults.find(r => r.stepId === dependencyId);
            
            if (!dependencyResult) {
                logger.warn(`Dependency not found: ${dependencyId} for step ${step.id}`);
                return false;
            }
            
            if (!dependencyResult.success) {
                logger.warn(`Dependency failed: ${dependencyId} for step ${step.id}`);
                return false;
            }
        }
        
        return true;
    }

    /**
     * 处理步骤失败
     */
    private async handleStepFailure(
        step: PlanStep, 
        result: ActionResult, 
        context: AgentContext
    ): Promise<boolean> {
        logger.warn(`Step failed: ${step.id} - ${result.error}`);
        
        // 根据步骤类型和错误类型决定是否继续
        const criticalActions = ['write_file', 'edit_file', 'delete_file'];
        
        if (criticalActions.includes(step.action)) {
            // 关键操作失败，通常应该停止
            return false;
        }
        
        // 非关键操作失败，可以继续
        return true;
    }

    /**
     * 检测副作用
     */
    private async detectSideEffects(
        step: PlanStep, 
        toolResult: any, 
        context: AgentContext
    ): Promise<string[]> {
        const sideEffects: string[] = [];
        
        // 检测文件系统变更
        if (['write_file', 'edit_file', 'create_directory', 'move_file', 'delete_file'].includes(step.action)) {
            sideEffects.push('文件系统已修改');
        }
        
        // 检测Git状态变更
        if (context.gitStatus && ['write_file', 'edit_file', 'delete_file'].includes(step.action)) {
            sideEffects.push('Git工作区状态可能已变更');
        }
        
        return sideEffects;
    }

    /**
     * 步骤执行后更新上下文
     */
    private async updateContextAfterStep(
        step: PlanStep, 
        result: ActionResult, 
        context: AgentContext
    ): Promise<void> {
        // 如果是文件操作，可能需要更新上下文中的文件信息
        if (result.success && ['write_file', 'edit_file'].includes(step.action)) {
            // 这里可以更新最近修改的文件列表等
            logger.debug(`Context updated after step: ${step.id}`);
        }
    }

    /**
     * 获取步骤执行统计
     */
    getExecutionStats(results: ActionResult[]): {
        total: number;
        successful: number;
        failed: number;
        totalDuration: number;
        averageDuration: number;
    } {
        const total = results.length;
        const successful = results.filter(r => r.success).length;
        const failed = total - successful;
        const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
        const averageDuration = total > 0 ? totalDuration / total : 0;
        
        return {
            total,
            successful,
            failed,
            totalDuration,
            averageDuration
        };
    }

    /**
     * 回滚步骤（如果可能）
     */
    async rollbackStep(step: PlanStep, result: ActionResult): Promise<boolean> {
        logger.info(`Attempting to rollback step: ${step.id}`);
        
        try {
            // 根据步骤类型尝试回滚
            switch (step.action) {
                case 'write_file':
                    // 删除创建的文件
                    if (result.data?.path) {
                        await this.toolSystem.executeTool('delete_file', { 
                            path: result.data.path 
                        });
                        return true;
                    }
                    break;
                    
                case 'edit_file':
                    // 这里需要更复杂的逻辑来恢复原始内容
                    // 暂时返回false，表示无法回滚
                    return false;
                    
                case 'create_directory':
                    // 删除创建的目录
                    if (result.data?.path) {
                        await this.toolSystem.executeTool('delete_file', { 
                            path: result.data.path,
                            recursive: true 
                        });
                        return true;
                    }
                    break;
                    
                default:
                    // 读取操作等无需回滚
                    return true;
            }
        } catch (error) {
            logger.error(`Failed to rollback step: ${step.id}`, error);
        }
        
        return false;
    }
}
