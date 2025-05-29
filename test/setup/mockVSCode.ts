/**
 * VSCode API 模拟 - 用于独立测试环境
 */

import * as fs from 'fs';
import * as path from 'path';

// 模拟 VSCode 命名空间
export const mockVSCode = {
    workspace: {
        workspaceFolders: [
            {
                uri: {
                    fsPath: process.cwd()
                },
                name: 'test-workspace',
                index: 0
            }
        ],
        textDocuments: [],
        getConfiguration: (section?: string) => ({
            get: (key: string, defaultValue?: any) => defaultValue,
            update: (key: string, value: any) => Promise.resolve(),
            has: (key: string) => false,
            inspect: (key: string) => undefined
        }),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
        onDidOpenTextDocument: () => ({ dispose: () => {} }),
        onDidCloseTextDocument: () => ({ dispose: () => {} }),
        onDidSaveTextDocument: () => ({ dispose: () => {} })
    },

    window: {
        activeTextEditor: null,
        terminals: [],
        showInformationMessage: (message: string, ...items: string[]) => {
            console.log(`[INFO] ${message}`);
            return Promise.resolve(items[0]);
        },
        showWarningMessage: (message: string, ...items: string[]) => {
            console.log(`[WARN] ${message}`);
            return Promise.resolve(items[0]);
        },
        showErrorMessage: (message: string, ...items: string[]) => {
            console.log(`[ERROR] ${message}`);
            return Promise.resolve(items[0]);
        },
        createOutputChannel: (name: string) => ({
            append: (text: string) => console.log(`[${name}] ${text}`),
            appendLine: (text: string) => console.log(`[${name}] ${text}`),
            clear: () => {},
            show: () => {},
            hide: () => {},
            dispose: () => {}
        }),
        createWebviewPanel: () => ({
            webview: {
                html: '',
                onDidReceiveMessage: () => ({ dispose: () => {} }),
                postMessage: () => Promise.resolve(true)
            },
            onDidDispose: () => ({ dispose: () => {} }),
            dispose: () => {}
        })
    },

    languages: {
        getDiagnostics: () => new Map(),
        registerCompletionItemProvider: () => ({ dispose: () => {} }),
        createDiagnosticCollection: () => ({
            set: () => {},
            delete: () => {},
            clear: () => {},
            dispose: () => {}
        })
    },

    extensions: {
        getExtension: (id: string) => {
            if (id === 'vscode.git') {
                return {
                    exports: {
                        getAPI: () => ({
                            repositories: [{
                                state: {
                                    HEAD: { name: 'main' },
                                    workingTreeChanges: [],
                                    indexChanges: [],
                                    untrackedChanges: []
                                }
                            }]
                        })
                    }
                };
            }
            return undefined;
        }
    },

    Uri: {
        file: (path: string) => ({ fsPath: path, scheme: 'file' }),
        parse: (uri: string) => ({ fsPath: uri, scheme: 'file' })
    },

    Range: class {
        constructor(
            public start: { line: number; character: number },
            public end: { line: number; character: number }
        ) {}
    },

    Position: class {
        constructor(
            public line: number,
            public character: number
        ) {}
    },

    DiagnosticSeverity: {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3
    },

    CompletionItemKind: {
        Text: 0,
        Method: 1,
        Function: 2,
        Constructor: 3,
        Field: 4,
        Variable: 5,
        Class: 6,
        Interface: 7,
        Module: 8,
        Property: 9,
        Unit: 10,
        Value: 11,
        Enum: 12,
        Keyword: 13,
        Snippet: 14,
        Color: 15,
        File: 16,
        Reference: 17
    }
};

// 模拟 logger
export const mockLogger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    debug: (...args: any[]) => console.log('[DEBUG]', ...args),
    dispose: () => {}
};

// 模拟 AI Client
export class MockAIClient {
    async chat(prompt: string, history?: any[]): Promise<string> {
        // 模拟 AI 响应
        if (prompt.includes('read_file')) {
            return 'TOOL_CALL:read_file:{"path": "test.txt"}';
        }
        if (prompt.includes('list_files')) {
            return 'TOOL_CALL:list_files:{"path": "./", "recursive": false}';
        }
        if (prompt.includes('实现') || prompt.includes('implement')) {
            return `我将帮你实现这个功能。让我分析一下需求并制定计划。

根据你的要求，我需要：
1. 分析现有代码结构
2. 设计实现方案
3. 编写代码
4. 测试功能

让我开始执行这些步骤。`;
        }
        
        return `我理解你的请求: ${prompt}。我会帮你处理这个任务。`;
    }

    async complete(prompt: string): Promise<string> {
        // 模拟代码补全
        if (prompt.includes('function')) {
            return 'function example() {\n    return "Hello World";\n}';
        }
        return 'console.log("Hello World");';
    }
}

// 设置全局模拟
export function setupMockEnvironment() {
    // 模拟 VSCode 全局对象
    (global as any).vscode = mockVSCode;
    
    // 模拟 Node.js 模块
    if (!process.env.NODE_ENV) {
        process.env.NODE_ENV = 'test';
    }
    
    console.log('Mock environment setup complete');
}

// 清理模拟环境
export function teardownMockEnvironment() {
    delete (global as any).vscode;
    console.log('Mock environment cleaned up');
}
