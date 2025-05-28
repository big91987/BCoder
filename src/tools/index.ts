import * as vscode from 'vscode';
import { ToolManager } from './toolManager';
import { SecurityManager } from '../security/securityManager';
import { ToolExecutionContext } from './types';

// 文件操作工具
import { 
    ReadFileTool, 
    WriteFileTool, 
    EditFileTool, 
    GetFileInfoTool 
} from './fileTools';

// 目录操作工具
import { 
    ListFilesTool, 
    CreateDirectoryTool, 
    MoveFileTool, 
    DeleteFileTool 
} from './directoryTools';

// 搜索工具
import { 
    SearchFilesTool, 
    SearchInFilesTool 
} from './searchTools';

import { logger } from '../utils/logger';

/**
 * 工具系统初始化器
 */
export class ToolSystem {
    private toolManager: ToolManager;
    private securityManager: SecurityManager;
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.securityManager = new SecurityManager(workspaceRoot);
        
        const context: ToolExecutionContext = {
            workspaceRoot: workspaceRoot,
            security: this.securityManager.getSecurityContext()
        };
        
        this.toolManager = new ToolManager(context);
        this.initializeTools();
    }

    /**
     * 初始化所有工具
     */
    private initializeTools(): void {
        logger.info('Initializing tool system...');

        // 注册文件操作工具
        this.toolManager.registerTool(new ReadFileTool(this.securityManager));
        this.toolManager.registerTool(new WriteFileTool(this.securityManager));
        this.toolManager.registerTool(new EditFileTool(this.securityManager));
        this.toolManager.registerTool(new GetFileInfoTool(this.securityManager));

        // 注册目录操作工具
        this.toolManager.registerTool(new ListFilesTool(this.securityManager));
        this.toolManager.registerTool(new CreateDirectoryTool(this.securityManager));
        this.toolManager.registerTool(new MoveFileTool(this.securityManager));
        this.toolManager.registerTool(new DeleteFileTool(this.securityManager));

        // 注册搜索工具
        this.toolManager.registerTool(new SearchFilesTool(this.securityManager, this.workspaceRoot));
        this.toolManager.registerTool(new SearchInFilesTool(this.securityManager, this.workspaceRoot));

        logger.info(`Tool system initialized with ${this.toolManager.getTools().length} tools`);
    }

    /**
     * 获取工具管理器
     */
    getToolManager(): ToolManager {
        return this.toolManager;
    }

    /**
     * 获取安全管理器
     */
    getSecurityManager(): SecurityManager {
        return this.securityManager;
    }

    /**
     * 更新工作区根目录
     */
    updateWorkspaceRoot(newRoot: string): void {
        this.workspaceRoot = newRoot;
        this.securityManager = new SecurityManager(newRoot);
        
        const context: ToolExecutionContext = {
            workspaceRoot: newRoot,
            security: this.securityManager.getSecurityContext()
        };
        
        this.toolManager.updateContext(context);
        logger.info(`Workspace root updated to: ${newRoot}`);
    }

    /**
     * 获取工具定义（用于 LLM）
     */
    getToolDefinitions(): any[] {
        return this.toolManager.getToolDefinitions();
    }

    /**
     * 执行工具调用
     */
    async executeTool(toolName: string, args: Record<string, any>) {
        return await this.toolManager.executeTool({ name: toolName, arguments: args });
    }

    /**
     * 批量执行工具调用
     */
    async executeTools(toolCalls: Array<{ name: string; arguments: Record<string, any> }>) {
        return await this.toolManager.executeTools(toolCalls);
    }

    /**
     * 获取工具使用统计
     */
    getToolStats(): { [toolName: string]: number } {
        // TODO: 实现工具使用统计
        return {};
    }

    /**
     * 清理资源
     */
    dispose(): void {
        logger.info('Tool system disposed');
    }
}

/**
 * 创建工具系统实例
 */
export function createToolSystem(context: vscode.ExtensionContext): ToolSystem {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    return new ToolSystem(workspaceRoot);
}

// 导出类型
export * from './types';
export { ToolManager } from './toolManager';
export { SecurityManager } from '../security/securityManager';
