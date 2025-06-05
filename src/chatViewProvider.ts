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

    // 🔧 添加恢复状态跟踪，防止重复恢复
    private hasRestored = false;

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

        // 🔧 修复：接受VSCode的设计，每次都设置HTML并恢复消息
        logger.info('🏗️ Setting HTML content for WebView');
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 🔧 重置恢复状态，允许新的WebView恢复
        this.hasRestored = false;
        logger.info('🔄 WebView created/recreated, waiting for webviewReady event to restore messages');

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.message);
                    break;
                case 'clearChat':
                    logger.info('🗑️ Clear chat button clicked');
                    this.clearChat();
                    break;
                case 'webviewReady':
                    // 🔧 WebView准备就绪，触发恢复（防重复恢复）
                    logger.info('🎯 Webview ready event received');
                    if (!this.hasRestored) {
                        logger.info('🔄 Starting message restore...');
                        const cachedMessages = this._chatCache.getCurrentMessages();
                        if (cachedMessages.length > 0) {
                            this.hasRestored = true; // 标记为已恢复
                            this.restoreMessagesFromCache(cachedMessages);
                        } else {
                            logger.info('📭 No messages to restore');
                            this.hasRestored = true; // 即使没有消息也标记为已恢复
                        }
                    } else {
                        logger.info('⏭️ Skipping restore - already restored');
                    }
                    break;
                case 'frontendDebug':
                    // 记录前端调试信息到后端日志
                    if (data.data) {
                        logger.info(`${data.message}`, data.data);
                    } else {
                        logger.info(data.message);
                    }
                    break;
                case 'forceRestore':
                    // 强制恢复聊天记录（用于调试）
                    logger.info('🔧 Force restore requested');
                    {
                        const cachedMessages = this._chatCache.getCurrentMessages();
                        this.restoreMessagesFromCache(cachedMessages);
                    }
                    break;
            }
        });
    }

    /**
     * 简化的消息恢复方法
     */
    private restoreMessagesFromCache(messages: any[]) {
        logger.info(`🔄 Restoring ${messages.length} messages from cache`);

        if (!this._view) {
            logger.warn('⚠️ No webview available for restore');
            return;
        }

        // 分批发送消息，避免前端处理冲突
        let messageIndex = 0;
        const sendNextMessage = () => {
            if (messageIndex >= messages.length) {
                logger.info(`✅ Successfully restored ${messages.length} messages`);
                return;
            }

            const msg = messages[messageIndex];
            messageIndex++;

            // 跳过空消息和流式消息
            if (!msg.content?.trim() ||
                msg.messageType === 'streaming_start' ||
                msg.messageType === 'streaming_delta' ||
                msg.messageType === 'streaming_complete') {
                setTimeout(sendNextMessage, 10);
                return;
            }

            // 发送消息到前端
            if (msg.messageType) {
                // 结构化消息
                this._view!.webview.postMessage({
                    type: 'agentMessage',
                    messageType: msg.messageType,
                    content: msg.content,
                    data: msg.data || {},
                    timestamp: msg.timestamp
                });
            } else {
                // 普通消息
                this._view!.webview.postMessage({
                    type: 'agentMessage',
                    messageType: msg.role === 'user' ? 'user_message' : 'assistant_message',
                    content: msg.content,
                    data: {},
                    timestamp: msg.timestamp
                });
            }

            // 延迟发送下一条消息
            setTimeout(sendNextMessage, 50);
        };

        sendNextMessage();
    }

    private async handleUserMessage(message: string) {
        logger.info('📝 handleUserMessage called - NEW VERSION:', message.substring(0, 50));
        if (!message.trim()) return;

        // Add user message to cache
        logger.info('💾 Adding user message to cache');
        this._chatCache.addMessage('user', message);

        const messagesAfterAdd = this._chatCache.getCurrentMessages();
        logger.info(`📊 Messages count after add: ${messagesAfterAdd.length}`);

        // 发送用户消息到前端
        if (this._view) {
            this._view.webview.postMessage({
                type: 'agentMessage',
                messageType: 'user_message',
                content: message,
                data: {},
                timestamp: new Date()
            });
        }

        try {
            // Show typing indicator
            this.showTypingIndicator();

            // Create assistant message in cache
            const assistantMessage = this._chatCache.addMessage('assistant', '');

            // Get AI response with structured message handling
            const response = await this._chatProvider.askQuestionWithStructuredMessages(message, (agentMessage: any) => {
                // Handle structured agent messages
                this.handleAgentMessage(agentMessage);
            });

            // 使用结构化消息时，不需要更新缓存和UI，因为消息已经通过 handleAgentMessage 实时发送到前端
            // 只需要更新历史记录用于下次对话
            const messages = this._chatCache.getCurrentMessages();
            const lastMessage = messages[messages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
                lastMessage.content = response;
                // addMessage 方法会自动保存，这里不需要手动保存
            }

        } catch (error) {
            logger.error('Error in chat:', error);

            // Send error message directly to frontend
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'agentMessage',
                    messageType: 'error',
                    content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    data: { error: error instanceof Error ? error.message : 'Unknown error' },
                    timestamp: new Date()
                });
            }
        }
    }

    private showTypingIndicator() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'showTyping'
            });
        }
    }

    private clearChat() {
        logger.info('🗑️ Clearing chat - clearing all history');

        // 1. 清除 ChatCache 的当前会话
        this._chatCache.clearCurrentSession();

        // 2. 清除 ChatProvider 的对话历史（如果存在）
        if (this._chatProvider) {
            this._chatProvider.clearHistory();
        }

        // 3. 重置恢复状态
        this.hasRestored = false;

        // 4. 清除前端界面
        if (this._view) {
            this._view.webview.postMessage({
                type: 'agentMessage',
                messageType: 'clear',
                content: '',
                data: {},
                timestamp: new Date()
            });
        }

        logger.info('✅ Chat cleared completely');
    }

    // 流式消息累积器
    private streamingAccumulator: string = '';
    private isStreamingActive: boolean = false;

    private handleAgentMessage(agentMessage: any) {
        logger.debug(`[CHAT] [${agentMessage.sessionId || 'unknown'}] Agent message: ${agentMessage.type}`, {
            content: agentMessage.content
        });

        // 🔧 修复：流式消息处理逻辑
        logger.debug(`🔧 [STREAMING] Processing message type: ${agentMessage.type}`);

        if (agentMessage.type === 'streaming_start') {
            // 开始流式消息，重置累积器
            logger.debug(`🔧 [STREAMING] Starting stream, content: "${agentMessage.content}"`);
            this.streamingAccumulator = agentMessage.content || '';
            this.isStreamingActive = true;
            // 不保存到缓存，只发送到前端
        } else if (agentMessage.type === 'streaming_delta') {
            // 累积流式内容
            logger.debug(`🔧 [STREAMING] Delta received, active: ${this.isStreamingActive}, content: "${agentMessage.content}"`);
            if (this.isStreamingActive) {
                this.streamingAccumulator += agentMessage.content || '';
                logger.debug(`🔧 [STREAMING] Accumulated length: ${this.streamingAccumulator.length}`);
            }
            // 不保存到缓存，只发送到前端
        } else if (agentMessage.type === 'streaming_complete') {
            // 流式完成，保存完整内容到缓存
            logger.debug(`🔧 [STREAMING] Completing stream, active: ${this.isStreamingActive}, accumulated: "${this.streamingAccumulator}"`);
            logger.debug(`🔧 [STREAMING] Accumulated length: ${this.streamingAccumulator.length}`);
            if (this.isStreamingActive) {
                this._chatCache.addStructuredMessage('text', this.streamingAccumulator, {});
                logger.debug(`🔧 [STREAMING] Saved complete message to cache as 'text' type with content: "${this.streamingAccumulator}"`);
                this.isStreamingActive = false;
                this.streamingAccumulator = '';
            }
            // 🔧 修复：需要发送到前端来重置状态
            // 继续执行，让前端处理 streaming_complete
        } else {
            // 非流式消息，正常保存到缓存
            logger.debug(`🔧 [STREAMING] Non-streaming message, saving to cache: ${agentMessage.type}`);
            this._chatCache.addStructuredMessage(agentMessage.type, agentMessage.content, agentMessage.data || agentMessage.metadata);
        }

        // 发送结构化消息到前端 - 支持新旧两种格式
        if (this._view) {
            const messageToSend: any = {
                type: 'agentMessage',
                content: agentMessage.content,
                timestamp: agentMessage.timestamp
            };

            // 检查是否为新的标准化消息格式
            if (agentMessage.role && agentMessage.type) {
                // 新的标准化消息格式
                messageToSend.role = agentMessage.role;
                messageToSend.type = agentMessage.type;
                messageToSend.metadata = agentMessage.metadata;
            } else {
                // 旧的消息格式
                messageToSend.messageType = agentMessage.type;
                messageToSend.data = agentMessage.data;
            }

            this._view.webview.postMessage(messageToSend);
        }
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

                .restore-btn {
                    background: none;
                    border: none;
                    color: var(--vscode-textLink-foreground);
                    cursor: pointer;
                    font-size: 12px;
                    padding: 4px 8px;
                    border-radius: 3px;
                    margin-left: 5px;
                }

                .restore-btn:hover {
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

                /* 角色头部样式 */
                .role-header {
                    font-size: 11px;
                    font-weight: bold;
                    color: #666;
                    margin-bottom: 4px;
                    opacity: 0.8;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .message.assistant .role-header {
                    color: var(--vscode-textLink-foreground);
                }

                /* 消息内容样式 */
                .message-content {
                    line-height: 1.4;
                }

                /* 工具执行框 */
                .tool-execution {
                    align-self: flex-start;
                    background-color: #f8f9fa;
                    border: 2px solid #007ACC;
                    border-radius: 8px;
                    margin: 8px 0;
                    max-width: 95%;
                    width: auto;
                    min-width: 300px;
                    overflow: visible;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .tool-header {
                    background-color: #007ACC;
                    color: white;
                    padding: 10px 12px;
                    font-size: 13px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .tool-content {
                    padding: 10px 12px;
                    font-size: 13px;
                    line-height: 1.4;
                    color: #333;
                    background-color: white;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                    white-space: pre-wrap;
                }

                .tool-status {
                    padding: 8px 12px;
                    font-size: 12px;
                    border-top: 1px solid #dee2e6;
                    font-weight: bold;
                }

                .tool-status.success {
                    background-color: #28a745;
                    color: white;
                }

                .tool-status.error {
                    background-color: #dc3545;
                    color: white;
                }

                /* 思考过程框 */
                .thinking-box {
                    align-self: flex-start;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    margin: 3px 0;
                    max-width: 80%;
                    font-size: 12px;
                    opacity: 0.8;
                }

                .thinking-header {
                    padding: 6px 10px;
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    font-weight: bold;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .thinking-content {
                    padding: 8px 10px;
                    font-style: italic;
                    display: none;
                }

                .thinking-content.expanded {
                    display: block;
                }

                /* 进度框 */
                .progress-box {
                    align-self: flex-start;
                    background-color: var(--vscode-progressBar-background);
                    border-radius: 4px;
                    margin: 3px 0;
                    max-width: 70%;
                    padding: 6px 10px;
                    font-size: 12px;
                    color: var(--vscode-foreground);
                }

                /* 系统消息框 */
                .system-message {
                    align-self: center;
                    background-color: var(--vscode-notifications-background);
                    border: 1px solid var(--vscode-notifications-border);
                    border-radius: 6px;
                    padding: 8px 12px;
                    margin: 5px 0;
                    font-size: 12px;
                    text-align: center;
                    max-width: 60%;
                    opacity: 0.9;
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

                /* 流式消息样式 */
                .message.streaming {
                    position: relative;
                }

                .streaming-cursor {
                    display: inline-block;
                    background-color: var(--vscode-textLink-foreground);
                    width: 2px;
                    height: 1em;
                    margin-left: 2px;
                    animation: blink 1s infinite;
                }

                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }

                .message.streaming .message-content {
                    position: relative;
                }

                /* 角色名称样式 */
                .role-header {
                    font-size: 11px;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                    margin-bottom: 4px;
                    opacity: 0.8;
                }

                .role-name {
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 2px 6px;
                    border-radius: 3px;
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



                /* 思考过程框 */
                .thinking-box {
                    align-self: flex-start;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    margin: 3px 0;
                    max-width: 80%;
                    font-size: 12px;
                    opacity: 0.8;
                }

                .thinking-header {
                    padding: 6px 10px;
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    font-weight: bold;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .thinking-content {
                    padding: 8px 10px;
                    font-style: italic;
                    display: none;
                }

                .thinking-content.expanded {
                    display: block;
                }

                /* 系统消息框 */
                .system-message {
                    align-self: center;
                    background-color: var(--vscode-notifications-background);
                    border: 1px solid var(--vscode-notifications-border);
                    border-radius: 6px;
                    padding: 8px 12px;
                    margin: 5px 0;
                    font-size: 12px;
                    text-align: center;
                    max-width: 60%;
                    opacity: 0.9;
                }
            </style>
        </head>
        <body>
            <div class="chat-header">
                <div class="chat-title">💬 BCoder Chat</div>
                <div>
                    <button class="restore-btn" onclick="forceRestore()">🔄 Restore</button>
                    <button class="clear-btn" onclick="clearChat()">🗑️ Clear</button>
                </div>
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
                    console.log('🗑️ [Frontend] Clear button clicked, sending clearChat message');
                    vscode.postMessage({ type: 'clearChat' });
                }

                function forceRestore() {
                    console.log('🔄 [Frontend] Force restore button clicked, sending forceRestore message');
                    vscode.postMessage({ type: 'forceRestore' });
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
                    // 简化版：根据消息类型选择渲染方式
                    const messageType = msg.type || msg.messageType;

                    switch (messageType) {
                        case 'thinking':
                            return renderThinkingMessage(msg);
                        case 'tool':
                            return renderToolMessage(msg);
                        case 'error':
                            return renderErrorMessage(msg);
                        case 'clear':
                            // clear 消息在 handleAgentMessage 中特殊处理
                            return null;
                        default:
                            // 默认渲染为聊天消息（text 类型）
                            return renderChatMessage({
                                role: msg.role || (msg.messageType === 'user_message' ? 'user' : 'assistant'),
                                content: msg.content,
                                timestamp: msg.timestamp
                            });
                    }
                }

                function renderChatMessage(msg) {
                    const messageDiv = document.createElement('div');
                    messageDiv.className = \`message \${msg.role}\`;

                    // 如果是助手消息，添加角色名称
                    if (msg.role === 'assistant' || (msg.role && msg.role !== 'user')) {
                        const roleHeader = document.createElement('div');
                        roleHeader.className = 'role-header';

                        // 角色名称映射
                        const roleName = getRoleName(msg.role);
                        roleHeader.textContent = roleName;
                        messageDiv.appendChild(roleHeader);
                    }

                    const content = document.createElement('div');
                    content.className = 'message-content';
                    content.textContent = msg.content;
                    messageDiv.appendChild(content);

                    const timestamp = document.createElement('div');
                    timestamp.className = 'timestamp';
                    timestamp.textContent = formatTimestamp(msg.timestamp);
                    messageDiv.appendChild(timestamp);

                    return messageDiv;
                }

                function renderAgentMessage(msg) {
                    const messageType = msg.messageType;

                    switch (messageType) {
                        case 'tool_start':
                        case 'tool_complete':
                        case 'tool_error':
                        case 'tool_progress':
                            return renderToolMessage(msg);

                        case 'thinking':
                        case 'planning':
                            return renderThinkingMessage(msg);

                        case 'system_info':
                        case 'progress':
                            return renderSystemMessage(msg);

                        case 'error':
                            return renderErrorMessage(msg);

                        case 'task_start':
                        case 'task_complete':
                            return renderTaskMessage(msg);

                        case 'user_message':
                        case 'assistant_message':
                            return renderChatMessage({
                                role: msg.messageType === 'user_message' ? 'user' : 'assistant',
                                content: msg.content,
                                timestamp: msg.timestamp
                            });

                        default:
                            return renderChatMessage(msg);
                    }
                }

                function renderToolMessage(msg) {
                    const toolDiv = document.createElement('div');
                    toolDiv.className = 'tool-execution';

                    // 工具头部
                    const header = document.createElement('div');
                    header.className = 'tool-header';

                    // 支持新旧两种消息格式
                    let icon, toolName, isSuccess, isError;
                    if (msg.role && msg.type) {
                        // 新的标准化消息格式
                        icon = getStandardToolIcon(msg.type);
                        toolName = msg.metadata?.toolName || 'Unknown Tool';
                        isSuccess = msg.metadata?.success === true;
                        isError = msg.type === 'tool_error';
                    } else {
                        // 旧的消息格式
                        icon = getToolIcon(msg.messageType);
                        toolName = msg.data?.toolName || 'Unknown Tool';
                        isSuccess = msg.data?.success === true;
                        isError = msg.messageType === 'tool_error';
                    }

                    header.innerHTML = \`\${icon} \${toolName}\`;
                    toolDiv.appendChild(header);

                    // 工具内容
                    const content = document.createElement('div');
                    content.className = 'tool-content';
                    content.textContent = msg.content;
                    toolDiv.appendChild(content);

                    // 工具状态
                    if (isSuccess || isError) {
                        const status = document.createElement('div');
                        status.className = \`tool-status \${isSuccess ? 'success' : 'error'}\`;
                        status.textContent = isSuccess ? '执行成功' : '执行失败';
                        toolDiv.appendChild(status);
                    }

                    return toolDiv;
                }

                function renderThinkingMessage(msg) {
                    const thinkingDiv = document.createElement('div');
                    thinkingDiv.className = 'thinking-box';

                    const header = document.createElement('div');
                    header.className = 'thinking-header';
                    header.innerHTML = \`💭 \${msg.messageType === 'planning' ? '规划' : '思考'} <span style="font-size: 10px;">▼</span>\`;
                    header.onclick = () => toggleThinking(thinkingDiv);
                    thinkingDiv.appendChild(header);

                    const content = document.createElement('div');
                    content.className = 'thinking-content';
                    content.textContent = msg.content;
                    thinkingDiv.appendChild(content);

                    return thinkingDiv;
                }

                function renderSystemMessage(msg) {
                    const systemDiv = document.createElement('div');
                    systemDiv.className = 'system-message';
                    systemDiv.textContent = msg.content;
                    return systemDiv;
                }

                function renderErrorMessage(msg) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'message error';
                    errorDiv.textContent = msg.content;
                    return errorDiv;
                }

                function renderStandardMessage(msg) {
                    // 根据 role 和 type 决定渲染方式
                    switch (msg.type) {
                        case 'text':
                            // 普通文本消息，根据 role 决定样式
                            if (msg.role === 'user') {
                                return renderChatMessage({
                                    role: 'user',
                                    content: msg.content,
                                    timestamp: msg.timestamp
                                });
                            } else {
                                return renderChatMessage({
                                    role: 'assistant',
                                    content: msg.content,
                                    timestamp: msg.timestamp
                                });
                            }

                        case 'tool_start':
                        case 'tool_result':
                        case 'tool_error':
                            // 工具消息使用工具框样式
                            return renderToolMessage(msg);

                        case 'task_complete':
                            // 任务完成消息渲染为助手消息
                            return renderChatMessage({
                                role: 'assistant',
                                content: msg.content,
                                timestamp: msg.timestamp
                            });

                        case 'error':
                        case 'warning':
                        case 'info':
                            // 系统消息
                            const systemDiv = document.createElement('div');
                            systemDiv.className = 'system-message';
                            const icon = msg.type === 'error' ? '❌' : msg.type === 'warning' ? '⚠️' : 'ℹ️';
                            systemDiv.innerHTML = \`<strong>\${icon} \${msg.content}</strong>\`;
                            return systemDiv;

                        default:
                            // 默认渲染为普通消息
                            return renderChatMessage({
                                role: msg.role || 'assistant',
                                content: msg.content,
                                timestamp: msg.timestamp
                            });
                    }
                }

                function renderTaskMessage(msg) {
                    // 检查是否为新的标准化消息格式
                    if (msg.role && msg.type) {
                        return renderStandardMessage(msg);
                    }

                    // 向后兼容：旧的消息格式
                    if (msg.messageType === 'task_complete' && msg.data?.result) {
                        return renderChatMessage({
                            role: 'assistant',
                            content: msg.data.result,
                            timestamp: msg.timestamp
                        });
                    } else {
                        // 其他任务消息（如 task_start）使用系统消息样式
                        const taskDiv = document.createElement('div');
                        taskDiv.className = 'system-message';
                        taskDiv.innerHTML = \`<strong>\${msg.content}</strong>\`;
                        return taskDiv;
                    }
                }

                function getToolIcon(messageType) {
                    switch (messageType) {
                        case 'tool_start': return '⚡';
                        case 'tool_complete': return '✅';
                        case 'tool_error': return '❌';
                        case 'tool_progress': return '⏳';
                        default: return '🔧';
                    }
                }

                function getStandardToolIcon(type) {
                    switch (type) {
                        case 'tool_start': return '⚡';
                        case 'tool_result': return '✅';
                        case 'tool_error': return '❌';
                        case 'tool_progress': return '⏳';
                        default: return '🔧';
                    }
                }

                function getRoleName(role) {
                    switch (role) {
                        case 'assistant':
                        case 'bcoder':
                            return 'BCoder';
                        case 'user':
                            return 'You';
                        case 'system':
                            return 'System';
                        case 'tool':
                            return 'Tool';
                        case 'reviewer':
                            return 'Reviewer';
                        case 'coder':
                            return 'Coder';
                        case 'tester':
                            return 'Tester';
                        default:
                            // 首字母大写
                            return role.charAt(0).toUpperCase() + role.slice(1);
                    }
                }

                function toggleThinking(thinkingDiv) {
                    const content = thinkingDiv.querySelector('.thinking-content');
                    const header = thinkingDiv.querySelector('.thinking-header');

                    if (content.classList.contains('expanded')) {
                        content.classList.remove('expanded');
                        header.innerHTML = header.innerHTML.replace('▲', '▼');
                    } else {
                        content.classList.add('expanded');
                        header.innerHTML = header.innerHTML.replace('▼', '▲');
                    }
                }

                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;

                    // 发送前端调试信息到后端日志
                    vscode.postMessage({
                        type: 'frontendDebug',
                        message: '📨 [Frontend] Received message: ' + message.type,
                        data: {
                            role: message.role,
                            type: message.type,
                            messageType: message.messageType,
                            contentLength: message.content?.length || 0,
                            content: message.content,
                            hasMetadata: !!message.metadata,
                            hasData: !!message.data,
                            fullMessage: message
                        }
                    });

                    console.log('📨 [Frontend] Received message:', message.type, {
                        role: message.role,
                        type: message.type,
                        messageType: message.messageType,
                        contentLength: message.content?.length || 0,
                        hasMetadata: !!message.metadata,
                        hasData: !!message.data
                    });

                    // 直接处理所有消息，不过滤
                    if (message.type === 'showTyping') {
                        console.log('⏳ [Frontend] Showing typing indicator');
                        vscode.postMessage({
                            type: 'frontendDebug',
                            message: '⏳ [Frontend] Showing typing indicator'
                        });
                        showTypingIndicator();
                    } else {
                        // 所有其他消息都当作 agent 消息处理
                        console.log('🤖 [Frontend] Processing message type:', message.type);
                        vscode.postMessage({
                            type: 'frontendDebug',
                            message: '🤖 [Frontend] Processing message type: ' + message.type
                        });
                        handleAgentMessage(message);
                    }
                });



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

                // 全局变量：当前流式消息元素
                let currentStreamingElement = null;

                function handleAgentMessage(message) {
                    // 发送详细调试信息到后端日志
                    vscode.postMessage({
                        type: 'frontendDebug',
                        message: '🔍 [Frontend] handleAgentMessage called',
                        data: {
                            messageType: message.messageType,
                            type: message.type,
                            role: message.role,
                            contentLength: message.content?.length || 0,
                            content: message.content,  // 完整内容
                            hasMetadata: !!message.metadata,
                            hasData: !!message.data,
                            fullMessage: message  // 完整消息对象
                        }
                    });

                    console.log('🔍 [Frontend] handleAgentMessage called with:', {
                        messageType: message.messageType,
                        type: message.type,
                        role: message.role,
                        contentLength: message.content?.length || 0,
                        content: message.content,  // 显示完整内容
                        hasMetadata: !!message.metadata,
                        hasData: !!message.data,
                        fullMessage: message  // 显示完整消息对象
                    });

                    const container = document.getElementById('chatContainer');
                    // 修正：优先使用 messageType，因为 type 可能是 "agentMessage"
                    const messageType = message.messageType || message.type;

                    // Handle clear message
                    if (messageType === 'clear') {
                        console.log('🗑️ [Frontend] Received clear message, clearing chat container');
                        container.innerHTML = \`
                            <div class="empty-state">
                                <h3>👋 Hello!</h3>
                                <p>Ask me anything about your code.<br>I'm here to help!</p>
                            </div>
                        \`;
                        isTyping = false;
                        currentStreamingElement = null;
                        updateSendButton();
                        console.log('✅ [Frontend] Chat container cleared successfully');
                        return;
                    }

                    // Handle streaming messages
                    if (messageType === 'streaming_start') {
                        createStreamingMessage(message.content);
                        return;
                    }

                    if (messageType === 'streaming_delta') {
                        appendToStreamingMessage(message.content);
                        return;
                    }

                    if (messageType === 'streaming_complete') {
                        finalizeStreamingMessage();
                        return;
                    }

                    // Remove typing indicator if present
                    const typingIndicator = container.querySelector('.typing-indicator');
                    if (typingIndicator) {
                        typingIndicator.remove();
                    }

                    // Remove empty state if present
                    const emptyState = container.querySelector('.empty-state');
                    if (emptyState) {
                        emptyState.remove();
                    }

                    // Create message object for rendering
                    // 支持新的标准化消息格式
                    const msgObj = message.role && message.type ? {
                        // 新的标准化消息格式
                        role: message.role,
                        type: message.type,
                        content: message.content,
                        metadata: message.metadata,
                        timestamp: message.timestamp
                    } : {
                        // 旧的消息格式
                        messageType: message.messageType,
                        content: message.content,
                        data: message.data,
                        timestamp: message.timestamp
                    };

                    // 调试日志 - 支持新旧格式
                    const messageTypeForLog = msgObj.type || msgObj.messageType;
                    console.log('🎨 [Frontend] Rendering message:', messageTypeForLog);

                    // Render and append the message
                    const messageElement = renderMessage(msgObj);
                    console.log('📦 [Frontend] Created element:', messageElement.className, messageElement.innerHTML.substring(0, 100));

                    container.appendChild(messageElement);

                    // 重置 typing 状态 - 包括 task_complete 类型
                    const messageTypeForReset = message.type || message.messageType;
                    if (messageTypeForReset === 'text' || messageTypeForReset === 'error' || messageTypeForReset === 'task_complete') {
                        isTyping = false;
                        updateSendButton();
                        console.log('🔄 [Frontend] Reset typing state for message type:', messageTypeForReset);
                    }

                    // Scroll to bottom
                    container.scrollTop = container.scrollHeight;
                }

                // 流式消息处理函数
                function createStreamingMessage(initialContent) {
                    const container = document.getElementById('chatContainer');

                    // 移除空状态和打字指示器
                    const emptyState = container.querySelector('.empty-state');
                    if (emptyState) emptyState.remove();

                    const typingIndicator = container.querySelector('.typing-indicator');
                    if (typingIndicator) typingIndicator.remove();

                    // 创建流式消息容器
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'message assistant streaming';
                    messageDiv.innerHTML = \`
                        <div class="role-header">
                            <span class="role-name">BCoder</span>
                        </div>
                        <div class="message-content" id="streaming-content">\${initialContent}</div>
                        <div class="streaming-cursor">▊</div>
                        <div class="timestamp">\${new Date().toLocaleTimeString()}</div>
                    \`;

                    container.appendChild(messageDiv);
                    currentStreamingElement = messageDiv.querySelector('#streaming-content');

                    // 滚动到底部
                    container.scrollTop = container.scrollHeight;

                    console.log('🌊 [Frontend] Created streaming message with initial content:', initialContent);
                }

                function appendToStreamingMessage(deltaContent) {
                    if (currentStreamingElement) {
                        currentStreamingElement.textContent += deltaContent;

                        // 滚动到底部
                        const container = document.getElementById('chatContainer');
                        container.scrollTop = container.scrollHeight;

                        console.log('🌊 [Frontend] Appended to streaming message:', deltaContent);
                    } else {
                        console.warn('🌊 [Frontend] No current streaming element to append to');
                    }
                }

                function finalizeStreamingMessage() {
                    if (currentStreamingElement) {
                        // 移除光标
                        const cursor = currentStreamingElement.parentElement.querySelector('.streaming-cursor');
                        if (cursor) cursor.remove();

                        // 移除 streaming 类
                        const messageDiv = currentStreamingElement.closest('.message');
                        if (messageDiv) {
                            messageDiv.classList.remove('streaming');
                        }

                        currentStreamingElement = null;
                        isTyping = false;
                        updateSendButton();

                        console.log('🌊 [Frontend] Finalized streaming message');
                    }
                }
            </script>
        </body>
        </html>`;
    }
}
