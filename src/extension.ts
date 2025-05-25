import * as vscode from 'vscode';
import { CompletionProvider } from './completionProvider';
import { ChatProvider } from './chatProvider';
import { AIClient } from './utils/aiClient';
import { logger } from './utils/logger';
import { SettingsViewProvider } from './settingsView';
import { SettingsPanel } from './settingsPanel';


let completionProvider: CompletionProvider;
let chatProvider: ChatProvider;
let aiClient: AIClient;

export function activate(context: vscode.ExtensionContext) {
    console.log('BCoder extension is now active!');
    console.log('Extension URI:', context.extensionUri.toString());

    // Initialize AI client
    console.log('Initializing AI client...');
    aiClient = new AIClient();

    // Initialize providers
    console.log('Initializing providers...');
    completionProvider = new CompletionProvider(aiClient);
    chatProvider = new ChatProvider(aiClient);
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

    // Register chat view provider
    logger.info('Registering chat view provider...');
    const chatViewProvider = new ChatTreeProvider();
    const chatViewDisposable = vscode.window.registerTreeDataProvider('bcoderChat', chatViewProvider);
    logger.info('Chat view provider registered successfully');

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
        chatViewDisposable,
        settingsViewDisposable
    );

    // Show welcome message
    logger.info('Extension activation completed');
    vscode.window.showInformationMessage('BCoder AI Assistant is ready!');
}

export function deactivate() {
    logger.info('BCoder extension is now deactivated');
    logger.dispose();
}

class ChatTreeProvider implements vscode.TreeDataProvider<ChatItem> {
    constructor() {
        logger.info('ChatTreeProvider constructor called');
    }

    getTreeItem(element: ChatItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ChatItem): Thenable<ChatItem[]> {
        logger.info('getChildren called');
        if (!element) {
            // Root level items
            return Promise.resolve([
                new ChatItem('Ask Question', 'Click to ask a question', vscode.TreeItemCollapsibleState.None, 'bcoder.askQuestion'),
                new ChatItem('Explain Code', 'Explain selected code', vscode.TreeItemCollapsibleState.None, 'bcoder.explainCode'),
                new ChatItem('Generate Code', 'Generate new code', vscode.TreeItemCollapsibleState.None, 'bcoder.generateCode')
            ]);
        }
        return Promise.resolve([]);
    }
}

class ChatItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly commandId?: string
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        if (commandId) {
            this.command = {
                command: commandId,
                title: label
            };
        }
    }
}


