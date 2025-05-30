import * as vscode from 'vscode';
import { ChatProvider } from './chatProvider';
import { logger } from './utils/logger';
import { ChatCache, ChatMessage } from './utils/chatCache';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'bcoderChat';
    private _view?: vscode.WebviewView;
    private _chatCache: ChatCache;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _chatProvider: ChatProvider,
        context: vscode.ExtensionContext
    ) {
        logger.info('🔧 ChatViewProvider constructor called - NEW VERSION');
        this._chatCache = ChatCache.getInstance(context);
        logger.info('✅ ChatViewProvider initialized with cache system');

        // 立即检查缓存状态
        const stats = this._chatCache.getCacheStats();
        logger.info('📊 Cache stats on init:', stats);

        const currentMessages = this._chatCache.getCurrentMessages();
        logger.info(`💬 Current messages count: ${currentMessages.length}`);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        logger.info('🌐 resolveWebviewView called - NEW VERSION');
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 使用缓存系统恢复聊天记录 - 改进版
        const restoreChat = () => {
            const messages = this._chatCache.getCurrentMessages();
            logger.info(`🔄 Attempting to restore ${messages.length} messages from cache`);

            // 无论是否有消息都要调用 updateChatUI，确保界面正确初始化
            this.updateChatUI();

            if (messages.length > 0) {
                logger.info(`✅ Successfully restored ${messages.length} messages from cache`);
            } else {
                logger.info(`📭 No messages to restore, showing empty state`);
            }
        };

        // 更积极的恢复策略 - 多次尝试确保成功
        setTimeout(() => restoreChat(), 50);   // 立即尝试
        setTimeout(() => restoreChat(), 200);  // 短延迟
        setTimeout(() => restoreChat(), 500);  // 中延迟
        setTimeout(() => restoreChat(), 1000); // 长延迟
        setTimeout(() => restoreChat(), 2000); // 最后尝试

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.message);
                    break;
                case 'clearChat':
                    this.clearChat();
                    break;
                case 'webviewReady':
                    // webview 已完全加载，立即恢复聊天记录
                    logger.info('🎯 Webview ready event received, restoring chat immediately');
                    restoreChat();
                    break;
            }
        });
    }

    private async handleUserMessage(message: string) {
        logger.info('📝 handleUserMessage called - NEW VERSION:', message.substring(0, 50));
        if (!message.trim()) return;

        // Add user message to cache
        logger.info('💾 Adding user message to cache');
        this._chatCache.addMessage('user', message);

        const messagesAfterAdd = this._chatCache.getCurrentMessages();
        logger.info(`📊 Messages count after add: ${messagesAfterAdd.length}`);

        this.updateChatUI();

        try {
            // Show typing indicator
            this.showTypingIndicator();

            // Create assistant message in cache
            const assistantMessage = this._chatCache.addMessage('assistant', '');

            // Get AI response with streaming
            const response = await this._chatProvider.askQuestionStream(message, (chunk: string) => {
                // Update the assistant message content in cache
                const messages = this._chatCache.getCurrentMessages();
                const lastMessage = messages[messages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                    lastMessage.content += chunk;
                    this.updateChatUIStreaming();
                }
            });

            // Final update with complete response - 直接更新缓存中的消息
            const messages = this._chatCache.getCurrentMessages();
            const lastMessage = messages[messages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
                lastMessage.content = response;
            }
            this.updateChatUI();

        } catch (error) {
            logger.error('Error in chat:', error);

            // Add error message to cache
            this._chatCache.addMessage('assistant', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            this.updateChatUI();
        }
    }

    private showTypingIndicator() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'showTyping'
            });
        }
    }

    private updateChatUI() {
        if (this._view) {
            const messages = this._chatCache.getCurrentMessages();
            this._view.webview.postMessage({
                type: 'updateChat',
                history: messages
            });
        }
    }

    private updateChatUIStreaming() {
        if (this._view) {
            const messages = this._chatCache.getCurrentMessages();
            this._view.webview.postMessage({
                type: 'updateChatStreaming',
                history: messages
            });
        }
    }

    private clearChat() {
        this._chatCache.clearCurrentSession();
        this.updateChatUI();
    }



    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BCoder Chat</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    margin: 0;
                    padding: 0;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    background-color: var(--vscode-sideBar-background);
                    color: var(--vscode-foreground);
                }

                .chat-header {
                    padding: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-sideBarSectionHeader-background);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .chat-title {
                    font-weight: bold;
                    color: var(--vscode-sideBarTitle-foreground);
                }

                .clear-btn {
                    background: none;
                    border: none;
                    color: var(--vscode-textLink-foreground);
                    cursor: pointer;
                    font-size: 12px;
                    padding: 4px 8px;
                    border-radius: 3px;
                }

                .clear-btn:hover {
                    background-color: var(--vscode-toolbar-hoverBackground);
                }

                .chat-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .message {
                    max-width: 90%;
                    padding: 8px 12px;
                    border-radius: 8px;
                    word-wrap: break-word;
                    font-size: 13px;
                    line-height: 1.4;
                }

                .message.user {
                    align-self: flex-end;
                    background-color: #007ACC;
                    color: white;
                    margin-left: 20%;
                }

                .message.assistant {
                    align-self: flex-start;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    margin-right: 20%;
                }

                .message.error {
                    background-color: var(--vscode-inputValidation-errorBackground);
                    color: var(--vscode-inputValidation-errorForeground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                }

                .timestamp {
                    font-size: 10px;
                    opacity: 0.7;
                    margin-top: 4px;
                }

                .typing-indicator {
                    align-self: flex-start;
                    padding: 8px 12px;
                    background-color: var(--vscode-input-background);
                    border-radius: 8px;
                    font-style: italic;
                    opacity: 0.8;
                    animation: pulse 1.5s infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 0.8; }
                    50% { opacity: 0.4; }
                }

                .input-container {
                    padding: 10px;
                    border-top: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-sideBar-background);
                }

                .input-row {
                    display: flex;
                    gap: 8px;
                    align-items: flex-end;
                }

                .message-input {
                    flex: 1;
                    min-height: 20px;
                    max-height: 100px;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    font-family: var(--vscode-font-family);
                    font-size: 13px;
                    resize: none;
                    outline: none;
                }

                .message-input:focus {
                    border-color: var(--vscode-focusBorder);
                }

                .send-btn {
                    padding: 8px 12px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    white-space: nowrap;
                }

                .send-btn:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }

                .send-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .empty-state {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    text-align: center;
                    opacity: 0.7;
                    padding: 20px;
                }

                .empty-state h3 {
                    margin: 0 0 10px 0;
                    color: var(--vscode-textLink-foreground);
                }

                .empty-state p {
                    margin: 0;
                    font-size: 12px;
                    line-height: 1.4;
                }
            </style>
        </head>
        <body>
            <div class="chat-header">
                <div class="chat-title">💬 BCoder Chat</div>
                <button class="clear-btn" onclick="clearChat()">🗑️ Clear</button>
            </div>

            <div class="chat-container" id="chatContainer">
                <div class="empty-state">
                    <h3>👋 Hello!</h3>
                    <p>Ask me anything about your code.<br>I'm here to help!</p>
                </div>
            </div>

            <div class="input-container">
                <div class="input-row">
                    <textarea
                        id="messageInput"
                        class="message-input"
                        placeholder="Ask a question..."
                        rows="1"
                    ></textarea>
                    <button id="sendBtn" class="send-btn" onclick="sendMessage()">Send</button>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let isTyping = false;

                // 通知扩展 webview 已准备就绪
                window.addEventListener('load', function() {
                    setTimeout(() => {
                        vscode.postMessage({ type: 'webviewReady' });
                    }, 100);
                });

                // Auto-resize textarea
                const messageInput = document.getElementById('messageInput');
                messageInput.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
                });

                // Send message on Enter (but allow Shift+Enter for new line)
                messageInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                });

                function sendMessage() {
                    const input = document.getElementById('messageInput');
                    const message = input.value.trim();

                    if (!message || isTyping) return;

                    vscode.postMessage({
                        type: 'sendMessage',
                        message: message
                    });

                    input.value = '';
                    input.style.height = 'auto';
                    isTyping = true;
                    updateSendButton();
                }

                function clearChat() {
                    vscode.postMessage({ type: 'clearChat' });
                }

                function updateSendButton() {
                    const sendBtn = document.getElementById('sendBtn');
                    sendBtn.disabled = isTyping;
                    sendBtn.textContent = isTyping ? 'Thinking...' : 'Send';
                }

                function formatTimestamp(timestamp) {
                    const date = new Date(timestamp);
                    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }

                function renderMessage(msg) {
                    const messageDiv = document.createElement('div');
                    messageDiv.className = \`message \${msg.role}\`;

                    const content = document.createElement('div');
                    content.textContent = msg.content;
                    messageDiv.appendChild(content);

                    const timestamp = document.createElement('div');
                    timestamp.className = 'timestamp';
                    timestamp.textContent = formatTimestamp(msg.timestamp);
                    messageDiv.appendChild(timestamp);

                    return messageDiv;
                }

                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;

                    switch (message.type) {
                        case 'updateChat':
                            updateChatHistory(message.history);
                            break;
                        case 'updateChatStreaming':
                            updateChatHistoryStreaming(message.history);
                            break;
                        case 'showTyping':
                            showTypingIndicator();
                            break;
                    }
                });

                function updateChatHistory(history) {
                    const container = document.getElementById('chatContainer');
                    container.innerHTML = '';

                    if (history.length === 0) {
                        container.innerHTML = \`
                            <div class="empty-state">
                                <h3>👋 Hello!</h3>
                                <p>Ask me anything about your code.<br>I'm here to help!</p>
                            </div>
                        \`;
                    } else {
                        history.forEach(msg => {
                            container.appendChild(renderMessage(msg));
                        });
                    }

                    // Remove typing indicator
                    const typingIndicator = container.querySelector('.typing-indicator');
                    if (typingIndicator) {
                        typingIndicator.remove();
                    }

                    // Scroll to bottom
                    container.scrollTop = container.scrollHeight;

                    isTyping = false;
                    updateSendButton();
                }

                function updateChatHistoryStreaming(history) {
                    const container = document.getElementById('chatContainer');

                    // Remove typing indicator if present
                    const typingIndicator = container.querySelector('.typing-indicator');
                    if (typingIndicator) {
                        typingIndicator.remove();
                    }

                    // Clear and rebuild all messages
                    container.innerHTML = '';

                    if (history.length === 0) {
                        container.innerHTML = \`
                            <div class="empty-state">
                                <h3>👋 Hello!</h3>
                                <p>Ask me anything about your code.<br>I'm here to help!</p>
                            </div>
                        \`;
                    } else {
                        history.forEach(msg => {
                            container.appendChild(renderMessage(msg));
                        });
                    }

                    // Scroll to bottom
                    container.scrollTop = container.scrollHeight;
                }

                function showTypingIndicator() {
                    const container = document.getElementById('chatContainer');

                    // Remove existing typing indicator
                    const existingIndicator = container.querySelector('.typing-indicator');
                    if (existingIndicator) {
                        existingIndicator.remove();
                    }

                    // Add new typing indicator
                    const typingDiv = document.createElement('div');
                    typingDiv.className = 'typing-indicator';
                    typingDiv.textContent = 'BCoder is thinking...';
                    container.appendChild(typingDiv);

                    // Scroll to bottom
                    container.scrollTop = container.scrollHeight;
                }
            </script>
        </body>
        </html>`;
    }
}
