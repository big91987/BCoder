import * as vscode from 'vscode';
import { CompletionProvider } from './completionProvider';
import { ChatProvider } from './chatProvider';
import { AIClient } from './utils/aiClient';
import { logger } from './utils/logger';
import { SettingsViewProvider } from './settingsView';
import { SettingsPanel } from './settingsPanel';
import { ChatViewProvider } from './chatViewProvider';
import { createToolSystem, ToolSystem } from './tools';
import { AgentSystem } from './agent';


let completionProvider: CompletionProvider;
let chatProvider: ChatProvider;
let aiClient: AIClient;
let toolSystem: ToolSystem;
let agentSystem: AgentSystem;

export async function activate(context: vscode.ExtensionContext) {
    console.log('BCoder extension is now active!');
    console.log('Extension URI:', context.extensionUri.toString());

    // Initialize AI client
    console.log('Initializing AI client...');
    aiClient = new AIClient();

    // Initialize tool system
    console.log('Initializing tool system...');
    toolSystem = createToolSystem(context);
    console.log('Tool system initialized successfully');

    // Initialize agent system
    console.log('Initializing agent system...');
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    agentSystem = new AgentSystem(toolSystem, aiClient, workspaceRoot);
    console.log('Agent system initialized successfully');

    // AgentSystem 内部已经创建了 AgentManager，不需要重复创建
    console.log('Agent manager initialized via AgentSystem');

    console.log('Initializing providers...');
    completionProvider = new CompletionProvider(aiClient);

    // Use new ChatProvider architecture - 使用 AgentSystem 内部的 AgentManager
    const { ChatProvider } = require('./chatProvider');
    chatProvider = new ChatProvider(agentSystem.getAgentManager());
    console.log('Providers initialized successfully');

    // Register completion provider for all languages
    const completionDisposable = vscode.languages.registerCompletionItemProvider(
        { scheme: 'file' },
        completionProvider,
        '.',
        ' ',
        '(',
        ')',
        '[',
        ']',
        '{',
        '}',
        '"',
        "'",
        '=',
        ':'
    );

    // Register commands
    const askQuestionCommand = vscode.commands.registerCommand('bcoder.askQuestion', async () => {
        logger.info('askQuestion command triggered');

        const question = await vscode.window.showInputBox({
            prompt: 'Ask BCoder a question about your code',
            placeHolder: 'How do I implement a binary search?'
        });

        logger.info('User input question:', question || 'No question provided');

        if (question) {
            try {
                logger.info('Calling chatProvider.askQuestion...');
                const answer = await chatProvider.askQuestion(question);
                logger.info('Got answer from chatProvider, length:', answer.length);

                // Show answer in a new document
                const doc = await vscode.workspace.openTextDocument({
                    content: `Question: ${question}\n\nAnswer:\n${answer}`,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc);
                logger.info('Answer displayed in new document');
            } catch (error) {
                logger.error('Error in askQuestion command:', error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`BCoder Error: ${errorMessage}`);
            }
        }
    });

    const explainCodeCommand = vscode.commands.registerCommand('bcoder.explainCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);

        if (!selectedText) {
            vscode.window.showErrorMessage('Please select some code to explain');
            return;
        }

        try {
            const explanation = await chatProvider.explainCode(selectedText);

            // Show explanation in a new document
            const doc = await vscode.workspace.openTextDocument({
                content: `Code Explanation:\n\n${explanation}`,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`BCoder Error: ${errorMessage}`);
        }
    });

    const generateCodeCommand = vscode.commands.registerCommand('bcoder.generateCode', async () => {
        const prompt = await vscode.window.showInputBox({
            prompt: 'Describe the code you want to generate',
            placeHolder: 'Create a function that sorts an array'
        });

        if (prompt) {
            try {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const language = editor.document.languageId;
                    const generatedCode = await chatProvider.generateCode(prompt, language);

                    const position = editor.selection.active;
                    editor.edit(editBuilder => {
                        editBuilder.insert(position, generatedCode);
                    });
                } else {
                    vscode.window.showErrorMessage('No active editor found. Please open a file first.');
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`BCoder Error: ${errorMessage}`);
            }
        }
    });

    const toggleCompletionCommand = vscode.commands.registerCommand('bcoder.toggleCompletion', () => {
        const config = vscode.workspace.getConfiguration('bcoder');
        const currentValue = config.get('autoCompletion', true);
        config.update('autoCompletion', !currentValue, vscode.ConfigurationTarget.Global);

        vscode.window.showInformationMessage(
            `BCoder auto completion ${!currentValue ? 'enabled' : 'disabled'}`
        );
    });

    const openSettingsCommand = vscode.commands.registerCommand('bcoder.openSettings', () => {
        SettingsPanel.createOrShow(context.extensionUri);
    });

    // 添加日志查看命令
    const showLogsCommand = vscode.commands.registerCommand('bcoder.showLogs', () => {
        logger.show();
    });

    const dumpLogsCommand = vscode.commands.registerCommand('bcoder.dumpLogs', async () => {
        const categories = ['chat', 'agent', 'tool', 'ai', 'security', 'performance'];
        const selectedCategory = await vscode.window.showQuickPick(
            ['all', ...categories],
            { placeHolder: 'Select log category to dump' }
        );

        if (selectedCategory) {
            const category = selectedCategory === 'all' ? undefined : selectedCategory as any;
            const logs = logger.dumpLogs(category);

            const doc = await vscode.workspace.openTextDocument({
                content: logs,
                language: 'log'
            });
            await vscode.window.showTextDocument(doc);
        }
    });

    const clearLogsCommand = vscode.commands.registerCommand('bcoder.clearLogs', () => {
        logger.clearLogs();
        vscode.window.showInformationMessage('BCoder logs cleared');
    });

    const toggleDebugCommand = vscode.commands.registerCommand('bcoder.toggleDebug', () => {
        const currentMode = logger.getRecentLogs().length > 0; // 简单检查
        logger.setDebugMode(!currentMode);
        vscode.window.showInformationMessage(`Debug mode ${!currentMode ? 'enabled' : 'disabled'}`);
    });

    // 添加缓存管理命令
    const showCacheStatsCommand = vscode.commands.registerCommand('bcoder.showCacheStats', () => {
        const { ChatCache } = require('./utils/chatCache');
        const cache = ChatCache.getInstance();
        const stats = cache.getCacheStats();

        vscode.window.showInformationMessage(
            `BCoder 聊天缓存统计:\n会话数: ${stats.sessionCount}\n消息总数: ${stats.totalMessages}\n缓存大小: ${stats.cacheSize}`
        );
    });

    const clearCacheCommand = vscode.commands.registerCommand('bcoder.clearCache', async () => {
        const choice = await vscode.window.showWarningMessage(
            '确定要清空所有BCoder缓存吗？包括聊天记录、设置状态等。此操作不可撤销。',
            '清空所有缓存', '取消'
        );

        if (choice === '清空所有缓存') {
            try {
                logger.info('🗑️ Starting complete cache cleanup...');

                // 1. 清除聊天缓存
                const { ChatCache } = require('./utils/chatCache');
                const cache = ChatCache.getInstance();
                cache.clearAllCache();
                logger.info('🗑️ Chat cache cleared');

                // 2. 清除全局状态
                const globalKeys = context.globalState.keys();
                for (const key of globalKeys) {
                    if (key.startsWith('bcoder') || key.includes('chat') || key.includes('session')) {
                        await context.globalState.update(key, undefined);
                        logger.info(`🗑️ Cleared global state: ${key}`);
                    }
                }

                // 3. 清除工作区状态
                const workspaceKeys = context.workspaceState.keys();
                for (const key of workspaceKeys) {
                    if (key.startsWith('bcoder') || key.includes('chat') || key.includes('session')) {
                        await context.workspaceState.update(key, undefined);
                        logger.info(`🗑️ Cleared workspace state: ${key}`);
                    }
                }

                // 4. 清除日志
                logger.clearLogs();
                logger.info('🗑️ Logs cleared');

                logger.info('✅ Complete cache cleanup finished');
                vscode.window.showInformationMessage('所有BCoder缓存已清空，建议重启VSCode以确保完全生效');
            } catch (error) {
                logger.error('❌ Failed to clear cache:', error);
                vscode.window.showErrorMessage(`清除缓存失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    });

    const newChatSessionCommand = vscode.commands.registerCommand('bcoder.newChatSession', () => {
        const { ChatCache } = require('./utils/chatCache');
        const cache = ChatCache.getInstance();
        cache.createNewSession();
        vscode.window.showInformationMessage('已创建新的聊天会话');
    });

    // 🚀 新增：测试上下文功能的命令
    const showContextCommand = vscode.commands.registerCommand('bcoder.showContext', async () => {
        try {
            const { ContextManager } = await import('./context/contextManager');
            const contextManager = ContextManager.getInstance();
            const contextSummary = await contextManager.getContextSummary();

            // 在新文档中显示上下文信息
            const doc = await vscode.workspace.openTextDocument({
                content: `# BCoder 当前上下文信息\n\n${contextSummary}`,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`BCoder Error: ${errorMessage}`);
        }
    });

    // Register chat view provider
    logger.info('🔧 Registering chat view provider - NEW CACHE VERSION...');
    const chatViewProvider = new ChatViewProvider(context.extensionUri, chatProvider, context);
    const chatViewDisposable = vscode.window.registerWebviewViewProvider('bcoderChat', chatViewProvider);
    logger.info('✅ Chat view provider registered successfully - NEW CACHE VERSION');

    // Register settings view provider
    logger.info('Registering settings view provider...');
    const settingsViewProvider = new SettingsViewProvider(context.extensionUri);
    const settingsViewDisposable = vscode.window.registerWebviewViewProvider('bcoderSettings', settingsViewProvider);
    logger.info('Settings view provider registered successfully');

    // Add all disposables to context
    context.subscriptions.push(
        completionDisposable,
        askQuestionCommand,
        explainCodeCommand,
        generateCodeCommand,
        toggleCompletionCommand,
        openSettingsCommand,
        showLogsCommand,
        dumpLogsCommand,
        clearLogsCommand,
        toggleDebugCommand,
        showCacheStatsCommand,
        clearCacheCommand,
        newChatSessionCommand,
        showContextCommand,
        chatViewDisposable,
        settingsViewDisposable
    );

    // Show welcome message
    logger.info('Extension activation completed');
    vscode.window.showInformationMessage('BCoder AI Assistant is ready!');
}

export function deactivate() {
    logger.info('BCoder extension is now deactivated');

    // Clean up systems
    if (agentSystem) {
        agentSystem.dispose();
    }

    if (toolSystem) {
        toolSystem.dispose();
    }

    logger.dispose();
}




