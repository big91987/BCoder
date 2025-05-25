import * as vscode from 'vscode';

export class SettingsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'bcoderSettings';

    constructor(private readonly _extensionUri: vscode.Uri) {}

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

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'saveSettings':
                    await this.saveSettings(data.settings);
                    webviewView.webview.postMessage({
                        type: 'settingsSaved',
                        message: 'Settings saved successfully!'
                    });
                    break;
                case 'loadSettings':
                    const settings = await this.loadSettings();
                    webviewView.webview.postMessage({
                        type: 'settingsLoaded',
                        settings: settings
                    });
                    break;
            }
        });

        // Load settings on startup
        this.loadSettings().then(settings => {
            webviewView.webview.postMessage({
                type: 'settingsLoaded',
                settings: settings
            });
        });
    }

    private async saveSettings(settings: any) {
        console.log('Saving settings:', settings);
        const config = vscode.workspace.getConfiguration('bcoder');
        await config.update('apiEndpoint', settings.apiEndpoint, vscode.ConfigurationTarget.Global);
        await config.update('apiKey', settings.apiKey, vscode.ConfigurationTarget.Global);
        await config.update('enabled', settings.enabled, vscode.ConfigurationTarget.Global);
        await config.update('autoCompletion', settings.autoCompletion, vscode.ConfigurationTarget.Global);
        await config.update('maxCompletionLength', settings.maxCompletionLength, vscode.ConfigurationTarget.Global);
        await config.update('completionDelay', settings.completionDelay, vscode.ConfigurationTarget.Global);
        console.log('Settings saved successfully');

        // 强制刷新 AIClient 配置
        vscode.commands.executeCommand('bcoder.refreshConfig');
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

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BCoder Settings</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .setting-group {
                    margin-bottom: 20px;
                    padding: 15px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .setting-group h3 {
                    margin-top: 0;
                    color: var(--vscode-textLink-foreground);
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                input, select {
                    width: 100%;
                    padding: 8px;
                    margin-bottom: 10px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                }
                input[type="checkbox"] {
                    width: auto;
                    margin-right: 8px;
                }
                input[type="number"] {
                    width: 100px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 10px 20px;
                    border-radius: 2px;
                    cursor: pointer;
                    margin-right: 10px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .success-message {
                    color: var(--vscode-notificationsInfoIcon-foreground);
                    margin-top: 10px;
                    display: none;
                }
                .description {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 10px;
                }
            </style>
        </head>
        <body>
            <h2>BCoder Settings</h2>

            <div class="setting-group">
                <h3>🤖 AI Configuration</h3>
                <label for="apiEndpoint">API Endpoint:</label>
                <input type="text" id="apiEndpoint" placeholder="https://ark.cn-beijing.volces.com/api/v3/chat/completions">
                <div class="description">Enter the API endpoint for your AI service (e.g., OpenAI, 火山方舟豆包, etc.)</div>

                <label for="apiKey">API Key:</label>
                <input type="password" id="apiKey" placeholder="sk-...">
                <div class="description">Your API key (will be stored securely)</div>
            </div>

            <div class="setting-group">
                <h3>⚙️ General Settings</h3>
                <label>
                    <input type="checkbox" id="enabled"> Enable BCoder Assistant
                </label>
                <div class="description">Turn the entire extension on/off</div>

                <label>
                    <input type="checkbox" id="autoCompletion"> Enable Auto Completion
                </label>
                <div class="description">Automatically suggest code completions while typing</div>
            </div>

            <div class="setting-group">
                <h3>🔧 Advanced Settings</h3>
                <label for="maxCompletionLength">Max Completion Length:</label>
                <input type="number" id="maxCompletionLength" min="10" max="1000">
                <div class="description">Maximum number of characters in completion suggestions</div>

                <label for="completionDelay">Completion Delay (ms):</label>
                <input type="number" id="completionDelay" min="100" max="5000">
                <div class="description">Delay before showing completion suggestions</div>
            </div>

            <div style="margin-top: 30px;">
                <button onclick="saveSettings()">Save Settings</button>
                <button onclick="testConnection()">Test Connection</button>
            </div>

            <div id="message" class="success-message"></div>

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
                    // TODO: Implement connection test
                }

                function showMessage(text, type = 'success') {
                    const messageEl = document.getElementById('message');
                    messageEl.textContent = text;
                    messageEl.style.display = 'block';
                    messageEl.style.color = type === 'error' ? 'var(--vscode-errorForeground)' :
                                           type === 'info' ? 'var(--vscode-notificationsInfoIcon-foreground)' :
                                           'var(--vscode-notificationsInfoIcon-foreground)';

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
                            showMessage(message.message);
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
