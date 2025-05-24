import * as vscode from 'vscode';
import { CompletionProvider } from './completionProvider';
import { ChatProvider } from './chatProvider';
import { AIClient } from './utils/aiClient';

let completionProvider: CompletionProvider;
let chatProvider: ChatProvider;
let aiClient: AIClient;

export function activate(context: vscode.ExtensionContext) {
    console.log('BCoder extension is now active!');

    // Initialize AI client
    aiClient = new AIClient();

    // Initialize providers
    completionProvider = new CompletionProvider(aiClient);
    chatProvider = new ChatProvider(aiClient);

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
        const question = await vscode.window.showInputBox({
            prompt: 'Ask BCoder a question about your code',
            placeHolder: 'How do I implement a binary search?'
        });

        if (question) {
            const answer = await chatProvider.askQuestion(question);
            vscode.window.showInformationMessage(answer);
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

        const explanation = await chatProvider.explainCode(selectedText);

        // Show explanation in a new document
        const doc = await vscode.workspace.openTextDocument({
            content: `Code Explanation:\n\n${explanation}`,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
    });

    const generateCodeCommand = vscode.commands.registerCommand('bcoder.generateCode', async () => {
        const prompt = await vscode.window.showInputBox({
            prompt: 'Describe the code you want to generate',
            placeHolder: 'Create a function that sorts an array'
        });

        if (prompt) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const language = editor.document.languageId;
                const generatedCode = await chatProvider.generateCode(prompt, language);

                const position = editor.selection.active;
                editor.edit(editBuilder => {
                    editBuilder.insert(position, generatedCode);
                });
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

    // Register chat view provider
    const chatViewProvider = new ChatViewProvider(context.extensionUri, chatProvider);
    const chatViewDisposable = vscode.window.registerWebviewViewProvider('bcoderChat', chatViewProvider);

    // Add all disposables to context
    context.subscriptions.push(
        completionDisposable,
        askQuestionCommand,
        explainCodeCommand,
        generateCodeCommand,
        toggleCompletionCommand,
        chatViewDisposable
    );

    // Show welcome message
    vscode.window.showInformationMessage('BCoder AI Assistant is ready!');
}

export function deactivate() {
    console.log('BCoder extension is now deactivated');
}

class ChatViewProvider implements vscode.WebviewViewProvider {
    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _chatProvider: ChatProvider
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'askQuestion':
                    const answer = await this._chatProvider.askQuestion(data.question);
                    webviewView.webview.postMessage({
                        type: 'response',
                        answer: answer
                    });
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BCoder Chat</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 10px; }
                .chat-container { display: flex; flex-direction: column; height: 100%; }
                .messages { flex: 1; overflow-y: auto; margin-bottom: 10px; }
                .message { margin-bottom: 10px; padding: 8px; border-radius: 4px; }
                .user-message { background-color: var(--vscode-input-background); }
                .bot-message { background-color: var(--vscode-editor-background); }
                .input-container { display: flex; gap: 5px; }
                input { flex: 1; padding: 8px; }
                button { padding: 8px 12px; }
            </style>
        </head>
        <body>
            <div class="chat-container">
                <div class="messages" id="messages"></div>
                <div class="input-container">
                    <input type="text" id="questionInput" placeholder="Ask a question..." />
                    <button onclick="sendMessage()">Send</button>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();

                function sendMessage() {
                    const input = document.getElementById('questionInput');
                    const question = input.value.trim();
                    if (question) {
                        addMessage(question, 'user');
                        vscode.postMessage({ type: 'askQuestion', question: question });
                        input.value = '';
                    }
                }

                function addMessage(text, sender) {
                    const messages = document.getElementById('messages');
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'message ' + sender + '-message';
                    messageDiv.textContent = text;
                    messages.appendChild(messageDiv);
                    messages.scrollTop = messages.scrollHeight;
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'response') {
                        addMessage(message.answer, 'bot');
                    }
                });

                document.getElementById('questionInput').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        sendMessage();
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
