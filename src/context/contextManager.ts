import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface WorkspaceContext {
    // 基础信息
    workspaceRoot: string;
    workspaceName: string;
    
    // 当前文件信息
    activeFile?: {
        path: string;
        relativePath: string;
        language: string;
        content: string;
        lineCount: number;
        isDirty: boolean;
    };
    
    // 选中信息
    selection?: {
        text: string;
        range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        isEmpty: boolean;
    };
    
    // 光标位置
    cursor?: {
        line: number;
        character: number;
    };
    
    // Git信息
    git?: {
        branch: string;
        hasChanges: boolean;
        stagedFiles: string[];
        modifiedFiles: string[];
    };
    
    // 项目信息
    project?: {
        type: string;
        packageManager?: string;
        dependencies?: string[];
    };
    
    // 最近文件
    recentFiles?: string[];
    
    // 诊断信息
    diagnostics?: {
        errors: number;
        warnings: number;
        infos: number;
    };
}

export class ContextManager {
    private static instance: ContextManager;
    private currentContext: WorkspaceContext | null = null;
    private listeners: ((context: WorkspaceContext) => void)[] = [];
    private disposables: vscode.Disposable[] = [];

    private constructor() {
        this.setupEventListeners();
    }

    public static getInstance(): ContextManager {
        if (!ContextManager.instance) {
            ContextManager.instance = new ContextManager();
        }
        return ContextManager.instance;
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners() {
        // 监听活动编辑器变化
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.updateContext();
            })
        );

        // 监听文本选择变化
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(() => {
                this.updateContext();
            })
        );

        // 监听文档变化
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(() => {
                this.updateContext();
            })
        );

        // 监听工作区变化
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.updateContext();
            })
        );
    }

    /**
     * 获取当前完整上下文
     */
    public async getCurrentContext(): Promise<WorkspaceContext> {
        if (!this.currentContext) {
            await this.updateContext();
        }
        return this.currentContext!;
    }

    /**
     * 更新上下文信息
     */
    private async updateContext(): Promise<void> {
        try {
            const context = await this.collectContext();
            this.currentContext = context;
            
            // 通知所有监听器
            this.listeners.forEach(listener => {
                try {
                    listener(context);
                } catch (error) {
                    logger.error('Error in context listener:', error);
                }
            });
        } catch (error) {
            logger.error('Error updating context:', error);
        }
    }

    /**
     * 收集完整上下文信息
     */
    private async collectContext(): Promise<WorkspaceContext> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workspaceRoot = workspaceFolder?.uri.fsPath || process.cwd();
        const workspaceName = workspaceFolder?.name || path.basename(workspaceRoot);

        const context: WorkspaceContext = {
            workspaceRoot,
            workspaceName
        };

        // 获取活动文件信息
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const document = activeEditor.document;
            const relativePath = path.relative(workspaceRoot, document.fileName);
            
            context.activeFile = {
                path: document.fileName,
                relativePath,
                language: document.languageId,
                content: document.getText(),
                lineCount: document.lineCount,
                isDirty: document.isDirty
            };

            // 获取选中信息
            const selection = activeEditor.selection;
            if (!selection.isEmpty) {
                context.selection = {
                    text: document.getText(selection),
                    range: {
                        start: {
                            line: selection.start.line,
                            character: selection.start.character
                        },
                        end: {
                            line: selection.end.line,
                            character: selection.end.character
                        }
                    },
                    isEmpty: false
                };
            } else {
                context.selection = {
                    text: '',
                    range: {
                        start: { line: selection.start.line, character: selection.start.character },
                        end: { line: selection.end.line, character: selection.end.character }
                    },
                    isEmpty: true
                };
            }

            // 获取光标位置
            context.cursor = {
                line: selection.active.line,
                character: selection.active.character
            };
        }

        // 获取Git信息
        context.git = await this.getGitInfo();

        // 获取项目信息
        context.project = await this.getProjectInfo(workspaceRoot);

        // 获取诊断信息
        context.diagnostics = await this.getDiagnosticsInfo();

        return context;
    }

    /**
     * 获取Git信息
     */
    private async getGitInfo(): Promise<WorkspaceContext['git']> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension?.isActive) {
                return undefined;
            }

            const git = gitExtension.exports.getAPI(1);
            const repository = git.repositories[0];
            
            if (!repository) {
                return undefined;
            }

            const status = repository.state;
            
            return {
                branch: status.HEAD?.name || 'unknown',
                hasChanges: status.workingTreeChanges.length > 0 || status.indexChanges.length > 0,
                stagedFiles: status.indexChanges.map((change: any) => change.uri.fsPath),
                modifiedFiles: status.workingTreeChanges.map((change: any) => change.uri.fsPath)
            };
        } catch (error) {
            logger.debug('Failed to get git info:', error);
            return undefined;
        }
    }

    /**
     * 获取项目信息
     */
    private async getProjectInfo(workspaceRoot: string): Promise<WorkspaceContext['project']> {
        try {
            // 检查package.json
            const packageJsonPath = path.join(workspaceRoot, 'package.json');
            try {
                const packageJson = JSON.parse(
                    await vscode.workspace.fs.readFile(vscode.Uri.file(packageJsonPath)).then(
                        data => Buffer.from(data).toString()
                    )
                );
                
                return {
                    type: 'node',
                    packageManager: await this.detectPackageManager(workspaceRoot),
                    dependencies: Object.keys(packageJson.dependencies || {})
                };
            } catch {
                // package.json不存在，继续检查其他项目类型
            }

            // 检查其他项目类型...
            // 可以添加对Python、Java、Go等项目的检测

            return {
                type: 'unknown'
            };
        } catch (error) {
            logger.debug('Failed to get project info:', error);
            return { type: 'unknown' };
        }
    }

    /**
     * 检测包管理器
     */
    private async detectPackageManager(workspaceRoot: string): Promise<string> {
        const lockFiles = [
            { file: 'pnpm-lock.yaml', manager: 'pnpm' },
            { file: 'yarn.lock', manager: 'yarn' },
            { file: 'package-lock.json', manager: 'npm' }
        ];

        for (const { file, manager } of lockFiles) {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(path.join(workspaceRoot, file)));
                return manager;
            } catch {
                // 文件不存在，继续检查下一个
            }
        }

        return 'npm'; // 默认
    }

    /**
     * 获取诊断信息
     */
    private async getDiagnosticsInfo(): Promise<WorkspaceContext['diagnostics']> {
        try {
            const diagnostics = vscode.languages.getDiagnostics();
            let errors = 0, warnings = 0, infos = 0;

            diagnostics.forEach(([uri, diagnosticArray]) => {
                diagnosticArray.forEach(diagnostic => {
                    switch (diagnostic.severity) {
                        case vscode.DiagnosticSeverity.Error:
                            errors++;
                            break;
                        case vscode.DiagnosticSeverity.Warning:
                            warnings++;
                            break;
                        case vscode.DiagnosticSeverity.Information:
                            infos++;
                            break;
                    }
                });
            });

            return { errors, warnings, infos };
        } catch (error) {
            logger.debug('Failed to get diagnostics info:', error);
            return { errors: 0, warnings: 0, infos: 0 };
        }
    }

    /**
     * 添加上下文变化监听器
     */
    public onContextChange(listener: (context: WorkspaceContext) => void): vscode.Disposable {
        this.listeners.push(listener);
        
        return new vscode.Disposable(() => {
            const index = this.listeners.indexOf(listener);
            if (index > -1) {
                this.listeners.splice(index, 1);
            }
        });
    }

    /**
     * 获取上下文摘要（用于LLM）
     */
    public async getContextSummary(): Promise<string> {
        const context = await this.getCurrentContext();
        
        let summary = `## 当前工作环境\n`;
        summary += `**项目**: ${context.workspaceName}\n`;
        summary += `**路径**: ${context.workspaceRoot}\n\n`;

        if (context.activeFile) {
            summary += `## 当前文件\n`;
            summary += `**文件**: ${context.activeFile.relativePath}\n`;
            summary += `**语言**: ${context.activeFile.language}\n`;
            summary += `**行数**: ${context.activeFile.lineCount}\n`;
            if (context.activeFile.isDirty) {
                summary += `**状态**: 未保存\n`;
            }
            summary += `\n`;
        }

        if (context.selection && !context.selection.isEmpty) {
            summary += `## 选中内容\n`;
            summary += `**位置**: 第${context.selection.range.start.line + 1}-${context.selection.range.end.line + 1}行\n`;
            summary += `**内容**: \n\`\`\`${context.activeFile?.language || ''}\n${context.selection.text}\n\`\`\`\n\n`;
        } else if (context.cursor) {
            summary += `## 光标位置\n`;
            summary += `**位置**: 第${context.cursor.line + 1}行，第${context.cursor.character + 1}列\n\n`;
        }

        if (context.git) {
            summary += `## Git状态\n`;
            summary += `**分支**: ${context.git.branch}\n`;
            summary += `**有变更**: ${context.git.hasChanges ? '是' : '否'}\n`;
            if (context.git.modifiedFiles.length > 0) {
                summary += `**修改文件**: ${context.git.modifiedFiles.length}个\n`;
            }
            summary += `\n`;
        }

        if (context.project) {
            summary += `## 项目信息\n`;
            summary += `**类型**: ${context.project.type}\n`;
            if (context.project.packageManager) {
                summary += `**包管理器**: ${context.project.packageManager}\n`;
            }
            summary += `\n`;
        }

        if (context.diagnostics && (context.diagnostics.errors > 0 || context.diagnostics.warnings > 0)) {
            summary += `## 代码问题\n`;
            if (context.diagnostics.errors > 0) {
                summary += `**错误**: ${context.diagnostics.errors}个\n`;
            }
            if (context.diagnostics.warnings > 0) {
                summary += `**警告**: ${context.diagnostics.warnings}个\n`;
            }
            summary += `\n`;
        }

        return summary;
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
        this.listeners = [];
    }
}
