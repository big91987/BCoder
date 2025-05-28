// 工具系统的类型定义

export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
    message?: string;
}

export interface ToolCall {
    name: string;
    arguments: Record<string, any>;
}

export interface Tool {
    name: string;
    description: string;
    parameters: ToolParameter[];
    execute(args: Record<string, any>): Promise<ToolResult>;
}

export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    required: boolean;
    default?: any;
}

// 文件操作相关类型
export interface FileInfo {
    path: string;
    name: string;
    size: number;
    isDirectory: boolean;
    lastModified: Date;
    extension?: string;
}

export interface SearchResult {
    path: string;
    line: number;
    column: number;
    content: string;
    context: string;
}

export interface EditChange {
    startLine: number;
    endLine: number;
    newText: string;
}

// 安全相关类型
export interface SecurityContext {
    workspaceRoot: string;
    allowedPaths: string[];
    deniedPaths: string[];
    maxFileSize: number;
}

export interface PermissionRequest {
    action: string;
    resource: string;
    details: Record<string, any>;
}

export interface PermissionResult {
    granted: boolean;
    reason?: string;
    autoApproved?: boolean;
}

// 工具执行上下文
export interface ToolExecutionContext {
    workspaceRoot: string;
    activeFile?: string;
    selectedText?: string;
    security: SecurityContext;
}
