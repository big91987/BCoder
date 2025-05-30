import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentContext, GitStatus, TerminalState, Diagnostic, ProjectStructure } from './types';
import { logger } from '../utils/logger';

/**
 * 上下文管理器 - 负责收集和管理工作区上下文信息
 */
export class ContextManager {
    private workspaceRoot: string;
    private cachedContext: AgentContext | null = null;
    private lastUpdateTime: number = 0;
    private readonly cacheTimeout = 5000; // 5秒缓存

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * 获取当前完整上下文
     */
    async getContext(forceRefresh: boolean = false): Promise<AgentContext> {
        const now = Date.now();
        
        if (!forceRefresh && 
            this.cachedContext && 
            (now - this.lastUpdateTime) < this.cacheTimeout) {
            return this.cachedContext;
        }

        logger.info('Collecting workspace context...');
        
        const context: AgentContext = {
            workspaceRoot: this.workspaceRoot,
            activeFile: await this.getActiveFile(),
            selectedText: await this.getSelectedText(),
            gitStatus: await this.getGitStatus(),
            terminalState: await this.getTerminalState(),
            diagnostics: await this.getDiagnostics(),
            recentFiles: await this.getRecentFiles(),
            projectStructure: await this.getProjectStructure()
        };

        this.cachedContext = context;
        this.lastUpdateTime = now;
        
        logger.info('Context collected successfully');
        return context;
    }

    /**
     * 获取活动文件信息
     */
    private async getActiveFile(): Promise<string | undefined> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                return activeEditor.document.fileName;
            }
        } catch (error) {
            logger.warn('Failed to get active file:', error);
        }
        return undefined;
    }

    /**
     * 获取选中文本
     */
    private async getSelectedText(): Promise<string | undefined> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && !activeEditor.selection.isEmpty) {
                return activeEditor.document.getText(activeEditor.selection);
            }
        } catch (error) {
            logger.warn('Failed to get selected text:', error);
        }
        return undefined;
    }

    /**
     * 获取 Git 状态
     */
    private async getGitStatus(): Promise<GitStatus | undefined> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
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
                modifiedFiles: status.workingTreeChanges.map((change: any) => change.uri.fsPath),
                untrackedFiles: status.untrackedChanges?.map((change: any) => change.uri.fsPath) || []
            };
        } catch (error) {
            logger.warn('Failed to get git status:', error);
            return undefined;
        }
    }

    /**
     * 获取终端状态
     */
    private async getTerminalState(): Promise<TerminalState | undefined> {
        try {
            const terminals = vscode.window.terminals;
            
            return {
                activeTerminals: terminals.length,
                workingDirectory: this.workspaceRoot,
                // Note: VSCode API doesn't provide access to terminal history
                // This would need to be tracked separately if needed
            };
        } catch (error) {
            logger.warn('Failed to get terminal state:', error);
            return undefined;
        }
    }

    /**
     * 获取诊断信息（错误、警告等）
     */
    private async getDiagnostics(): Promise<Diagnostic[]> {
        try {
            const diagnostics: Diagnostic[] = [];
            
            // 获取所有诊断信息
            vscode.languages.getDiagnostics().forEach(([uri, uriDiagnostics]) => {
                uriDiagnostics.forEach(diagnostic => {
                    diagnostics.push({
                        file: uri.fsPath,
                        line: diagnostic.range.start.line + 1,
                        column: diagnostic.range.start.character + 1,
                        severity: this.mapSeverity(diagnostic.severity),
                        message: diagnostic.message,
                        source: diagnostic.source || 'unknown'
                    });
                });
            });

            return diagnostics.slice(0, 50); // 限制数量
        } catch (error) {
            logger.warn('Failed to get diagnostics:', error);
            return [];
        }
    }

    /**
     * 映射诊断严重性
     */
    private mapSeverity(severity: vscode.DiagnosticSeverity): 'error' | 'warning' | 'info' {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error:
                return 'error';
            case vscode.DiagnosticSeverity.Warning:
                return 'warning';
            default:
                return 'info';
        }
    }

    /**
     * 获取最近打开的文件
     */
    private async getRecentFiles(): Promise<string[]> {
        try {
            const recentFiles: string[] = [];
            
            // 获取当前打开的所有文档
            vscode.workspace.textDocuments.forEach(doc => {
                if (doc.uri.scheme === 'file' && 
                    doc.fileName.startsWith(this.workspaceRoot)) {
                    recentFiles.push(doc.fileName);
                }
            });

            return recentFiles.slice(0, 10); // 限制数量
        } catch (error) {
            logger.warn('Failed to get recent files:', error);
            return [];
        }
    }

    /**
     * 分析项目结构
     */
    private async getProjectStructure(): Promise<ProjectStructure | undefined> {
        try {
            const structure: ProjectStructure = {
                type: 'unknown',
                mainFiles: [],
                configFiles: []
            };

            // 检查项目类型
            const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
            const requirementsPath = path.join(this.workspaceRoot, 'requirements.txt');
            const pomXmlPath = path.join(this.workspaceRoot, 'pom.xml');

            if (fs.existsSync(packageJsonPath)) {
                structure.type = 'node';
                structure.configFiles.push('package.json');
                
                // 检测包管理器
                if (fs.existsSync(path.join(this.workspaceRoot, 'yarn.lock'))) {
                    structure.packageManager = 'yarn';
                } else if (fs.existsSync(path.join(this.workspaceRoot, 'pnpm-lock.yaml'))) {
                    structure.packageManager = 'pnpm';
                } else {
                    structure.packageManager = 'npm';
                }

                // 读取依赖信息
                try {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                    structure.dependencies = Object.keys({
                        ...packageJson.dependencies,
                        ...packageJson.devDependencies
                    });
                } catch (error) {
                    logger.warn('Failed to parse package.json:', error);
                }
            } else if (fs.existsSync(requirementsPath)) {
                structure.type = 'python';
                structure.configFiles.push('requirements.txt');
            } else if (fs.existsSync(pomXmlPath)) {
                structure.type = 'java';
                structure.configFiles.push('pom.xml');
            }

            // 查找主要文件
            const commonMainFiles = [
                'index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts',
                'main.py', '__init__.py', 'Main.java', 'Application.java'
            ];

            for (const mainFile of commonMainFiles) {
                const mainFilePath = path.join(this.workspaceRoot, mainFile);
                if (fs.existsSync(mainFilePath)) {
                    structure.mainFiles.push(mainFile);
                }
            }

            // 查找配置文件
            const commonConfigFiles = [
                'tsconfig.json', 'webpack.config.js', '.eslintrc.js', '.prettierrc',
                'setup.py', 'pyproject.toml', 'build.gradle', 'settings.gradle'
            ];

            for (const configFile of commonConfigFiles) {
                const configFilePath = path.join(this.workspaceRoot, configFile);
                if (fs.existsSync(configFilePath)) {
                    structure.configFiles.push(configFile);
                }
            }

            return structure;
        } catch (error) {
            logger.warn('Failed to analyze project structure:', error);
            return undefined;
        }
    }

    /**
     * 更新特定上下文信息
     */
    async updateContext(updates: Partial<AgentContext>): Promise<void> {
        if (this.cachedContext) {
            this.cachedContext = { ...this.cachedContext, ...updates };
            this.lastUpdateTime = Date.now();
        }
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.cachedContext = null;
        this.lastUpdateTime = 0;
    }

    /**
     * 获取上下文摘要（用于 LLM）
     */
    async getContextSummary(): Promise<string> {
        const context = await this.getContext();
        
        let summary = `工作区: ${context.workspaceRoot}\n`;
        
        if (context.activeFile) {
            summary += `当前文件: ${path.relative(context.workspaceRoot, context.activeFile)}\n`;
        }
        
        if (context.selectedText) {
            summary += `选中文本: ${context.selectedText.substring(0, 100)}...\n`;
        }
        
        if (context.projectStructure) {
            summary += `项目类型: ${context.projectStructure.type}\n`;
            if (context.projectStructure.packageManager) {
                summary += `包管理器: ${context.projectStructure.packageManager}\n`;
            }
        }
        
        if (context.gitStatus) {
            summary += `Git 分支: ${context.gitStatus.branch}\n`;
            summary += `有变更: ${context.gitStatus.hasChanges ? '是' : '否'}\n`;
        }
        
        if (context.diagnostics && context.diagnostics.length > 0) {
            const errors = context.diagnostics.filter(d => d.severity === 'error').length;
            const warnings = context.diagnostics.filter(d => d.severity === 'warning').length;
            summary += `诊断: ${errors} 个错误, ${warnings} 个警告\n`;
        }
        
        return summary;
    }
}
