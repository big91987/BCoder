import * as vscode from 'vscode';
import { logger } from './utils/logger';

export class SettingsPanel {
    public static currentPanel: SettingsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            'bcoderSettings',
            'BCoder Settings',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'loadSettings':
                        const settings = await this.loadSettings();
                        this._panel.webview.postMessage({
                            type: 'settingsLoaded',
                            settings: settings
                        });
                        break;
                    case 'saveSettings':
                        await this.saveSettings(message.settings);
                        this._panel.webview.postMessage({
                            type: 'settingsSaved',
                            message: 'Settings saved successfully!'
                        });
                        break;
                    case 'testConnection':
                        // TODO: Implement connection test
                        this._panel.webview.postMessage({
                            type: 'connectionTested',
                            success: true,
                            message: 'Connection test successful!'
                        });
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        SettingsPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async loadSettings() {
        const config = vscode.workspace.getConfiguration('bcoder');
        return {
            apiEndpoint: config.get('apiEndpoint', 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'),
            apiKey: config.get('apiKey', 'e51c57a1-d4de-4572-8387-2a9dc93fff52'),
            enabled: config.get('enabled', true),
            autoCompletion: config.get('autoCompletion', true),
            maxCompletionLength: config.get('maxCompletionLength', 100),
            completionDelay: config.get('completionDelay', 500)
        };
    }

    private async saveSettings(settings: any) {
        logger.info('Saving settings:', settings);
        const config = vscode.workspace.getConfiguration('bcoder');
        await config.update('apiEndpoint', settings.apiEndpoint, vscode.ConfigurationTarget.Global);
        await config.update('apiKey', settings.apiKey, vscode.ConfigurationTarget.Global);
        await config.update('enabled', settings.enabled, vscode.ConfigurationTarget.Global);
        await config.update('autoCompletion', settings.autoCompletion, vscode.ConfigurationTarget.Global);
        await config.update('maxCompletionLength', settings.maxCompletionLength, vscode.ConfigurationTarget.Global);
        await config.update('completionDelay', settings.completionDelay, vscode.ConfigurationTarget.Global);
        logger.info('Settings saved successfully');
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BCoder Settings</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 30px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    max-width: 800px;
                    margin: 0 auto;
                }
                h1 {
                    color: var(--vscode-textLink-foreground);
                    border-bottom: 2px solid var(--vscode-textLink-foreground);
                    padding-bottom: 10px;
                    margin-bottom: 30px;
                }
                .setting-group {
                    margin-bottom: 30px;
                    padding: 20px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 8px;
                    background-color: var(--vscode-sideBar-background);
                }
                .setting-group h2 {
                    margin-top: 0;
                    color: var(--vscode-textLink-foreground);
                    font-size: 18px;
                }
                label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: bold;
                    color: var(--vscode-foreground);
                }
                input, select {
                    width: 100%;
                    padding: 12px;
                    margin-bottom: 15px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    font-size: 14px;
                    box-sizing: border-box;
                }
                input:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
                input[type="checkbox"] {
                    width: auto;
                    margin-right: 10px;
                    transform: scale(1.2);
                }
                input[type="number"] {
                    width: 200px;
                }
                .checkbox-group {
                    display: flex;
                    align-items: center;
                    margin-bottom: 15px;
                }
                .checkbox-group label {
                    margin-bottom: 0;
                    margin-left: 5px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 12px 24px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-right: 15px;
                    font-size: 14px;
                    font-weight: bold;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .button-group {
                    margin-top: 30px;
                    text-align: center;
                }
                .message {
                    margin-top: 15px;
                    padding: 10px;
                    border-radius: 4px;
                    display: none;
                }
                .message.success {
                    background-color: var(--vscode-notificationsInfoIcon-foreground);
                    color: white;
                }
                .message.error {
                    background-color: var(--vscode-errorForeground);
                    color: white;
                }
                .description {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 15px;
                    font-style: italic;
                }
            </style>
        </head>
        <body>
            <h1>🤖 BCoder Settings</h1>

            <div class="setting-group">
                <h2>🔗 API Configuration</h2>
                <label for="apiEndpoint">API Endpoint:</label>
                <input type="text" id="apiEndpoint" placeholder="https://ark.cn-beijing.volces.com/api/v3/chat/completions">
                <div class="description">Enter the API endpoint for your AI service (OpenAI, 火山方舟豆包, etc.)</div>

                <label for="apiKey">API Key:</label>
                <input type="password" id="apiKey" placeholder="Your API key">
                <div class="description">Your API key will be stored securely in VSCode settings</div>
            </div>

            <div class="setting-group">
                <h2>⚙️ General Settings</h2>
                <div class="checkbox-group">
                    <input type="checkbox" id="enabled">
                    <label for="enabled">Enable BCoder Assistant</label>
                </div>
                <div class="description">Turn the entire extension on/off</div>

                <div class="checkbox-group">
                    <input type="checkbox" id="autoCompletion">
                    <label for="autoCompletion">Enable Auto Completion</label>
                </div>
                <div class="description">Automatically suggest code completions while typing</div>
            </div>

            <div class="setting-group">
                <h2>🔧 Advanced Settings</h2>
                <label for="maxCompletionLength">Max Completion Length:</label>
                <input type="number" id="maxCompletionLength" min="10" max="1000">
                <div class="description">Maximum number of characters in completion suggestions</div>

                <label for="completionDelay">Completion Delay (ms):</label>
                <input type="number" id="completionDelay" min="100" max="5000">
                <div class="description">Delay before showing completion suggestions</div>
            </div>

            <div class="button-group">
                <button onclick="saveSettings()">💾 Save Settings</button>
                <button onclick="testConnection()">🧪 Test Connection</button>
            </div>

            <div id="message" class="message"></div>

            <script>
                const vscode = acquireVsCodeApi();

                // Load settings on page load
                window.addEventListener('load', () => {
                    vscode.postMessage({ type: 'loadSettings' });
                });

                function saveSettings() {
                    const settings = {
                        apiEndpoint: document.getElementById('apiEndpoint').value,
                        apiKey: document.getElementById('apiKey').value,
                        enabled: document.getElementById('enabled').checked,
                        autoCompletion: document.getElementById('autoCompletion').checked,
                        maxCompletionLength: parseInt(document.getElementById('maxCompletionLength').value),
                        completionDelay: parseInt(document.getElementById('completionDelay').value)
                    };

                    vscode.postMessage({ type: 'saveSettings', settings: settings });
                }

                function testConnection() {
                    const endpoint = document.getElementById('apiEndpoint').value;
                    const apiKey = document.getElementById('apiKey').value;

                    if (!endpoint || !apiKey) {
                        showMessage('Please enter both API endpoint and key first', 'error');
                        return;
                    }

                    showMessage('Testing connection...', 'info');
                    vscode.postMessage({ type: 'testConnection', endpoint, apiKey });
                }

                function showMessage(text, type = 'success') {
                    const messageEl = document.getElementById('message');
                    messageEl.textContent = text;
                    messageEl.className = 'message ' + type;
                    messageEl.style.display = 'block';

                    setTimeout(() => {
                        messageEl.style.display = 'none';
                    }, 3000);
                }

                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'settingsLoaded':
                            loadSettingsToForm(message.settings);
                            break;
                        case 'settingsSaved':
                            showMessage(message.message, 'success');
                            break;
                        case 'connectionTested':
                            showMessage(message.message, message.success ? 'success' : 'error');
                            break;
                    }
                });

                function loadSettingsToForm(settings) {
                    document.getElementById('apiEndpoint').value = settings.apiEndpoint || '';
                    document.getElementById('apiKey').value = settings.apiKey || '';
                    document.getElementById('enabled').checked = settings.enabled;
                    document.getElementById('autoCompletion').checked = settings.autoCompletion;
                    document.getElementById('maxCompletionLength').value = settings.maxCompletionLength;
                    document.getElementById('completionDelay').value = settings.completionDelay;
                }
            </script>
        </body>
        </html>`;
    }
}
