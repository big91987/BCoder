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

            // 🔧 修复：跳过空消息和所有不应该恢复的消息类型
            if (!msg.content?.trim() ||
                // 旧的流式消息类型
                msg.messageType === 'streaming_start' ||
                msg.messageType === 'streaming_delta' ||
                msg.messageType === 'streaming_complete' ||
                // 新的标准化消息类型 - 只恢复完整的消息，不恢复流式片段
                msg.messageType === 'think' ||  // 思考消息通常是流式的，不恢复
                msg.messageType === 'progress' || // 进度消息不恢复
                msg.messageType === 'tool_start' || // 工具开始消息不恢复
                msg.messageType === 'tool_error'   // 工具错误消息不恢复
            ) {
                logger.debug(`🔧 [RESTORE] Skipping message: type=${msg.messageType}, content="${msg.content?.substring(0, 50)}"`);
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

        // 🔧 修复：发送用户消息到前端，使用正确的消息类型
        if (this._view) {
            this._view.webview.postMessage({
                type: 'userMessage',  // 🔧 修复：用户消息应该是 userMessage，不是 agentMessage
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
        // 🔧 打印原始消息对象
        logger.info('🔍🔍🔍 [RAW MSG] ===== ORIGINAL MESSAGE DUMP =====');
        logger.info('🔍🔍🔍 [RAW MSG] FULL OBJECT:', JSON.stringify(agentMessage, null, 2));
        logger.info('🔍🔍🔍 [RAW MSG] ===== END DUMP =====');

        logger.debug(`[CHAT] [${agentMessage.sessionId || 'unknown'}] Agent message: ${agentMessage.type}`, {
            content: agentMessage.content
        });

        // 🔧 新的标准化流式消息处理逻辑
        logger.debug(`🔧 [STREAMING] Processing message: type=${agentMessage.type}, status=${agentMessage.status}`);

        // 检查是否为新的标准化消息格式
        if (agentMessage.status) {
            // 新的标准化消息格式：start/delta/end
            if (agentMessage.status === 'start') {
                // 开始流式消息，重置累积器
                logger.debug(`🔧 [STREAMING] Starting ${agentMessage.type} stream`);
                this.streamingAccumulator = agentMessage.content || '';
                this.isStreamingActive = true;
                // 不保存到缓存，只发送到前端
            } else if (agentMessage.status === 'delta') {
                // 累积流式内容
                logger.debug(`🔧 [STREAMING] Delta for ${agentMessage.type}: "${agentMessage.content}"`);
                if (this.isStreamingActive) {
                    this.streamingAccumulator += agentMessage.content || '';
                }
                // 不保存到缓存，只发送到前端
            } else if (agentMessage.status === 'end') {
                // 流式完成，保存完整内容到缓存
                logger.debug(`🔧 [STREAMING] Ending ${agentMessage.type} stream, final content: "${agentMessage.content}"`);
                if (this.isStreamingActive) {
                    // 使用end消息的完整内容，而不是累积的内容
                    const finalContent = agentMessage.content || this.streamingAccumulator;
                    this._chatCache.addStructuredMessage(agentMessage.type, finalContent, agentMessage.metadata || {});
                    logger.debug(`🔧 [STREAMING] Saved complete ${agentMessage.type} message to cache`);
                    this.isStreamingActive = false;
                    this.streamingAccumulator = '';
                }
                // 继续发送到前端
            }
        } else {
            // 旧的流式消息格式或非流式消息
            if (agentMessage.type === 'streaming_start') {
                this.streamingAccumulator = agentMessage.content || '';
                this.isStreamingActive = true;
            } else if (agentMessage.type === 'streaming_delta') {
                if (this.isStreamingActive) {
                    this.streamingAccumulator += agentMessage.content || '';
                }
            } else if (agentMessage.type === 'streaming_complete') {
                if (this.isStreamingActive) {
                    this._chatCache.addStructuredMessage('text', this.streamingAccumulator, {});
                    this.isStreamingActive = false;
                    this.streamingAccumulator = '';
                }
            } else {
                // 非流式消息，正常保存到缓存
                logger.debug(`🔧 [STREAMING] Non-streaming message, saving to cache: ${agentMessage.type}`);
                this._chatCache.addStructuredMessage(agentMessage.type, agentMessage.content, agentMessage.data || agentMessage.metadata);
            }
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
                messageToSend.status = agentMessage.status; // 🔧 添加status字段
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
            <title>BCoder Chat v4.0</title>
            <!-- 🔧 FORCE WEBVIEW RELOAD - VERSION 4.0 - TIMESTAMP: ${Date.now()} -->
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

                // 🔧 强制标记 - 确认webview重新加载
                console.log('🚀🚀🚀 [Frontend] WEBVIEW RELOADED - VERSION 5.0 - TIMESTAMP: ${Date.now()} 🚀🚀🚀');
                alert('🚀 WEBVIEW LOADED - VERSION 5.0!');

                // 通知扩展 webview 已准备就绪
                window.addEventListener('load', function() {
                    console.log('🚀 [Frontend] Window loaded - sending webviewReady');
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
                    // 支持新的标准化消息格式
                    const messageType = msg.type || msg.messageType;

                    switch (messageType) {
                        case 'think':
                        case 'thinking':
                            return renderThinkingMessage(msg);
                        case 'tool':
                            return renderToolMessage(msg);
                        case 'text':
                            return renderChatMessage({
                                role: msg.role || 'assistant',
                                content: msg.content,
                                timestamp: msg.timestamp
                            });
                        case 'error':
                            return renderErrorMessage(msg);
                        case 'clear':
                            // clear 消息在 handleAgentMessage 中特殊处理
                            return null;
                        default:
                            // 默认渲染为聊天消息
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

                    // 🔧 打印原始消息对象
                    console.log('🔍🔍🔍 [FRONTEND RAW] ===== ORIGINAL MESSAGE =====');
                    console.log('🔍🔍🔍 [FRONTEND RAW] FULL OBJECT:', JSON.stringify(message, null, 2));
                    console.log('🔍🔍🔍 [FRONTEND RAW] ===== END =====');

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

                    // 🔧 修复：正确区分消息类型
                    if (message.type === 'showTyping') {
                        console.log('⏳ [Frontend] Showing typing indicator');
                        vscode.postMessage({
                            type: 'frontendDebug',
                            message: '⏳ [Frontend] Showing typing indicator'
                        });
                        showTypingIndicator();
                    } else if (message.type === 'userMessage') {
                        // 🔧 修复：用户消息直接渲染，不通过 handleAgentMessage
                        console.log('👤 [Frontend] Processing user message');
                        vscode.postMessage({
                            type: 'frontendDebug',
                            message: '👤 [Frontend] Processing user message'
                        });
                        handleUserMessage(message);
                    } else {
                        // Agent 消息通过 handleAgentMessage 处理
                        console.log('🤖 [Frontend] Processing agent message type:', message.type);
                        vscode.postMessage({
                            type: 'frontendDebug',
                            message: '🤖 [Frontend] Processing agent message type: ' + message.type
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

                // 🔧 新增：处理用户消息的函数
                function handleUserMessage(message) {
                    console.log('👤 [Frontend] Handling user message:', message.content);

                    const container = document.getElementById('chatContainer');

                    // Remove empty state if present
                    const emptyState = container.querySelector('.empty-state');
                    if (emptyState) {
                        emptyState.remove();
                    }

                    // Create user message element
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'message user';
                    messageDiv.innerHTML = \`
                        <div class="message-content">\${message.content}</div>
                        <div class="timestamp">\${new Date().toLocaleTimeString()}</div>
                    \`;

                    container.appendChild(messageDiv);
                    container.scrollTop = container.scrollHeight;

                    console.log('👤 [Frontend] User message rendered');
                }

                // 全局变量：当前流式消息元素
                let currentStreamingElement = null;

                function handleAgentMessage(message) {
                    // 🔧 超详细的消息打印
                    console.log('🔍🔍🔍 [Frontend] ===== MESSAGE DUMP START =====');
                    console.log('📋 Type:', message.type);
                    console.log('📋 Role:', message.role);
                    console.log('📋 Content:', message.content);
                    console.log('📋 Status:', message.status);
                    console.log('📋 Timestamp:', message.timestamp);
                    console.log('📋 Metadata:', message.metadata);
                    console.log('📋 FULL OBJECT:', JSON.stringify(message, null, 2));
                    console.log('🔍🔍🔍 [Frontend] ===== MESSAGE DUMP END =====');

                    // 发送详细调试信息到后端日志
                    vscode.postMessage({
                        type: 'frontendDebug',
                        message: '🔍 [Frontend] FULL MESSAGE DUMP',
                        data: {
                            type: message.type,
                            role: message.role,
                            status: message.status,
                            content: message.content,
                            fullMessage: message
                        }
                    });

                    // 🔧 添加明显的标记确认代码更新
                    console.log('🚀 [Frontend] CODE UPDATED - VERSION 5.0!');

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

                    // 🔧 修复：优先检查流式消息状态
                    console.log('🔍 [Frontend] Checking streaming status:', message.status, 'messageType:', messageType);
                    console.log('🔍 [Frontend] Full message object:', JSON.stringify(message, null, 2));

                    // 检查是否为流式消息（优先检查status字段）
                    if (message.status) {
                        console.log('🌊 [Frontend] Detected streaming message with status:', message.status);

                        if (message.status === 'start') {
                            console.log('🌊 [Frontend] Starting streaming message');
                            createStreamingMessage(message.content, message.type || 'text', message.role || 'assistant');
                            return;
                        }

                        if (message.status === 'delta') {
                            console.log('🌊 [Frontend] Appending delta content:', message.content);
                            appendToStreamingMessage(message.content);
                            return;
                        }

                        if (message.status === 'end') {
                            console.log('🌊 [Frontend] Finalizing streaming message');
                            finalizeStreamingMessage(message.content);
                            return;
                        }
                    }

                    // 检查旧的流式消息格式
                    if (messageType === 'streaming_start' || messageType === 'streaming_delta' || messageType === 'streaming_complete') {
                        console.log('🌊 [Frontend] Detected old streaming format:', messageType);
                        // 处理旧格式...
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

                // 流式消息处理函数 - 支持不同类型的消息
                function createStreamingMessage(initialContent, messageType = 'text', role = 'assistant') {
                    const container = document.getElementById('chatContainer');

                    // 移除空状态和打字指示器
                    const emptyState = container.querySelector('.empty-state');
                    if (emptyState) emptyState.remove();

                    const typingIndicator = container.querySelector('.typing-indicator');
                    if (typingIndicator) typingIndicator.remove();

                    // 🔧 修复：生成唯一ID避免冲突
                    const streamingId = 'streaming-content-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                    let messageDiv;

                    // 根据消息类型创建不同的容器
                    if (messageType === 'think') {
                        // 思考消息 - 可收起的框
                        messageDiv = document.createElement('div');
                        messageDiv.className = 'thinking-box streaming';
                        messageDiv.innerHTML = \`
                            <div class="thinking-header">
                                💭 思考 <span style="font-size: 10px;">▼</span>
                            </div>
                            <div class="thinking-content expanded">
                                <div id="\${streamingId}">\${initialContent}</div>
                                <div class="streaming-cursor">▊</div>
                            </div>
                        \`;
                    } else if (messageType === 'tool') {
                        // 工具消息 - 工具执行框
                        messageDiv = document.createElement('div');
                        messageDiv.className = 'tool-execution streaming';
                        messageDiv.innerHTML = \`
                            <div class="tool-header">
                                ⚡ 工具执行
                            </div>
                            <div class="tool-content">
                                <div id="\${streamingId}">\${initialContent}</div>
                                <div class="streaming-cursor">▊</div>
                            </div>
                        \`;
                    } else {
                        // 普通文本消息
                        messageDiv = document.createElement('div');
                        messageDiv.className = 'message assistant streaming';
                        const roleName = getRoleName(role);
                        messageDiv.innerHTML = \`
                            <div class="role-header">
                                <span class="role-name">\${roleName}</span>
                            </div>
                            <div class="message-content" id="\${streamingId}">\${initialContent}</div>
                            <div class="streaming-cursor">▊</div>
                            <div class="timestamp">\${new Date().toLocaleTimeString()}</div>
                        \`;
                    }

                    container.appendChild(messageDiv);
                    currentStreamingElement = messageDiv.querySelector('#' + streamingId);

                    // 滚动到底部
                    container.scrollTop = container.scrollHeight;

                    console.log('🌊 [Frontend] Created streaming message:', messageType, 'with unique ID:', streamingId);
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

                function finalizeStreamingMessage(finalContent) {
                    if (currentStreamingElement) {
                        console.log('🔧 [Frontend] Finalizing with content:', finalContent);
                        console.log('🔧 [Frontend] Current element content before finalize:', currentStreamingElement.textContent);

                        // 🔧 修复：如果有最终内容且不为空，才更新内容
                        if (finalContent !== undefined && finalContent !== '') {
                            currentStreamingElement.textContent = finalContent;
                            console.log('🔧 [Frontend] Updated to final content:', finalContent);
                        } else {
                            console.log('🔧 [Frontend] Keeping existing content, final content is empty or undefined');
                        }

                        // 移除光标
                        const cursor = currentStreamingElement.parentElement.querySelector('.streaming-cursor');
                        if (cursor) cursor.remove();

                        // 移除 streaming 类
                        const messageDiv = currentStreamingElement.closest('.message, .thinking-box, .tool-execution');
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
