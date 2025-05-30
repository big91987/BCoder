// Agent 系统的类型定义

export interface AgentContext {
    workspaceRoot: string;
    activeFile?: string;
    selectedText?: string;
    gitStatus?: GitStatus;
    terminalState?: TerminalState;
    diagnostics?: Diagnostic[];
    recentFiles?: string[];
    projectStructure?: ProjectStructure;
}

export interface GitStatus {
    branch: string;
    hasChanges: boolean;
    stagedFiles: string[];
    modifiedFiles: string[];
    untrackedFiles: string[];
}

export interface TerminalState {
    activeTerminals: number;
    lastCommand?: string;
    lastOutput?: string;
    workingDirectory: string;
}

export interface Diagnostic {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
    source: string;
}

export interface ProjectStructure {
    type: 'node' | 'python' | 'java' | 'unknown';
    packageManager?: 'npm' | 'yarn' | 'pnpm';
    mainFiles: string[];
    configFiles: string[];
    dependencies?: string[];
}

export interface Task {
    id: string;
    description: string;
    type: TaskType;
    priority: TaskPriority;
    status: TaskStatus;
    subtasks?: Task[];
    dependencies?: string[];
    estimatedSteps?: number;
    context?: Record<string, any>;
}

export type TaskType =
    | 'bug_fix'
    | 'feature_implementation'
    | 'code_review'
    | 'refactoring'
    | 'testing'
    | 'documentation'
    | 'analysis';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type TaskStatus =
    | 'pending'
    | 'planning'
    | 'executing'
    | 'reflecting'
    | 'completed'
    | 'failed'
    | 'paused';

export interface Plan {
    id: string;
    taskId: string;
    steps: PlanStep[];
    estimatedDuration?: number;
    requiredTools: string[];
    riskAssessment?: RiskAssessment;
}

export interface PlanStep {
    id: string;
    description: string;
    action: ActionType;
    tools: string[];
    parameters: Record<string, any>;
    dependencies?: string[];
    validation?: ValidationCriteria;
}

export type ActionType =
    | 'read_file'
    | 'write_file'
    | 'edit_file'
    | 'get_file_info'
    | 'list_files'
    | 'create_directory'
    | 'move_file'
    | 'delete_file'
    | 'search_files'
    | 'search_in_files'
    | 'run_command'
    | 'analyze_code'
    | 'test_code'
    | 'commit_changes';

export interface ValidationCriteria {
    type: 'file_exists' | 'code_compiles' | 'tests_pass' | 'no_errors';
    parameters?: Record<string, any>;
}

export interface RiskAssessment {
    level: 'low' | 'medium' | 'high';
    factors: string[];
    mitigations: string[];
}

export interface ActionResult {
    stepId: string;
    success: boolean;
    data?: any;
    error?: string;
    duration: number;
    sideEffects?: string[];
}

export interface Reflection {
    taskId: string;
    planId: string;
    results: ActionResult[];
    success: boolean;
    lessonsLearned: string[];
    improvements: string[];
    shouldContinue: boolean;
    nextActions?: string[];
}

export interface AgentState {
    currentTask?: Task;
    currentPlan?: Plan;
    executionHistory: ActionResult[];
    context: AgentContext;
    isActive: boolean;
    lastReflection?: Reflection;
}

export interface AgentConfig {
    maxStepsPerTask: number;
    maxExecutionTime: number; // in milliseconds
    enableReflection: boolean;
    autoApprove: boolean;
    riskTolerance: 'low' | 'medium' | 'high';
    debugMode: boolean;
}

// Agent 事件类型
export interface AgentEvent {
    type: AgentEventType;
    timestamp: Date;
    data: any;
}

export type AgentEventType =
    | 'task_started'
    | 'task_completed'
    | 'task_failed'
    | 'plan_created'
    | 'step_started'
    | 'step_completed'
    | 'step_failed'
    | 'reflection_started'
    | 'reflection_completed'
    | 'user_intervention_required';

// 导入新的消息接口
import { AgentMessageCallbacks } from './messaging';

// Agent 回调接口 - 保持向后兼容，同时支持新的消息流
export interface AgentCallbacks extends AgentMessageCallbacks {
    // 传统回调 - 保持向后兼容
    onTaskStarted?: (task: Task) => void;
    onTaskCompleted?: (task: Task, reflection: Reflection) => void;
    onTaskFailed?: (task: Task, error: string) => void;
    onPlanCreated?: (plan: Plan) => void;
    onStepStarted?: (step: PlanStep) => void;
    onStepCompleted?: (step: PlanStep, result: ActionResult) => void;
    onUserInterventionRequired?: (reason: string, context: any) => Promise<boolean>;

    // 新的消息流回调已在 AgentMessageCallbacks 中定义
}
