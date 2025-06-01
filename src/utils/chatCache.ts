import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    sessionId?: string;
    // 新增：支持结构化消息
    messageType?: string;
    data?: any;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * 聊天缓存管理器 - 类似 Cline 的持久化机制
 */
export class ChatCache {
    private static instance: ChatCache;
    private cacheDir: string;
    private currentSession: ChatSession | null = null;
    private readonly maxSessions = 50; // 最多保存50个会话
    private readonly maxMessagesPerSession = 200; // 每个会话最多200条消息

    private constructor(private context: vscode.ExtensionContext) {
        logger.info('🏗️ ChatCache constructor called - NEW VERSION');
        // 使用 VSCode 的全局存储路径
        this.cacheDir = path.join(context.globalStorageUri.fsPath, 'chat-cache');
        logger.info('📁 Cache directory:', this.cacheDir);
        this.ensureCacheDir();
        this.loadCurrentSession();
        logger.info('✅ ChatCache initialization completed');
    }

    public static getInstance(context?: vscode.ExtensionContext): ChatCache {
        if (!ChatCache.instance && context) {
            ChatCache.instance = new ChatCache(context);
        }
        return ChatCache.instance;
    }

    /**
     * 确保缓存目录存在
     */
    private ensureCacheDir(): void {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
                logger.info('Chat cache directory created:', this.cacheDir);
            }
        } catch (error) {
            logger.error('Failed to create chat cache directory:', error);
        }
    }

    /**
     * 加载当前会话
     */
    private loadCurrentSession(): void {
        try {
            const currentSessionId = this.context.globalState.get<string>('currentChatSessionId');
            if (currentSessionId) {
                this.currentSession = this.loadSession(currentSessionId);
                if (this.currentSession) {
                    logger.info(`Loaded current chat session: ${currentSessionId} with ${this.currentSession.messages.length} messages`);
                } else {
                    // 会话文件不存在，创建新会话
                    this.createNewSession();
                }
            } else {
                // 没有当前会话，创建新会话
                this.createNewSession();
            }
        } catch (error) {
            logger.error('Failed to load current session:', error);
            this.createNewSession();
        }
    }

    /**
     * 创建新会话
     */
    public createNewSession(title?: string): ChatSession {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const session: ChatSession = {
            id: sessionId,
            title: title || `Chat ${new Date().toLocaleDateString()}`,
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.currentSession = session;
        this.saveSession(session);
        this.context.globalState.update('currentChatSessionId', sessionId);

        logger.info(`Created new chat session: ${sessionId}`);
        return session;
    }

    /**
     * 添加消息到当前会话
     */
    public addMessage(role: 'user' | 'assistant', content: string): ChatMessage {
        if (!this.currentSession) {
            this.createNewSession();
        }

        const message: ChatMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            role,
            content,
            timestamp: new Date(),
            sessionId: this.currentSession!.id
        };

        this.currentSession!.messages.push(message);
        this.currentSession!.updatedAt = new Date();

        // 限制消息数量
        if (this.currentSession!.messages.length > this.maxMessagesPerSession) {
            this.currentSession!.messages = this.currentSession!.messages.slice(-this.maxMessagesPerSession);
        }

        // 自动更新会话标题（使用第一条用户消息）
        if (this.currentSession!.messages.length === 1 && role === 'user') {
            this.currentSession!.title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
        }

        this.saveSession(this.currentSession!);
        logger.chatDebug('Message added to cache', {
            messageId: message.id,
            role,
            contentLength: content.length
        });

        return message;
    }

    /**
     * 添加结构化消息到当前会话
     */
    public addStructuredMessage(messageType: string, content: string, data?: any): ChatMessage {
        if (!this.currentSession) {
            this.createNewSession();
        }

        const message: ChatMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            role: 'assistant', // 结构化消息通常是助手消息
            content,
            timestamp: new Date(),
            sessionId: this.currentSession!.id,
            messageType,
            data
        };

        this.currentSession!.messages.push(message);
        this.currentSession!.updatedAt = new Date();

        // 限制消息数量
        if (this.currentSession!.messages.length > this.maxMessagesPerSession) {
            this.currentSession!.messages = this.currentSession!.messages.slice(-this.maxMessagesPerSession);
        }

        this.saveSession(this.currentSession!);
        logger.chatDebug('Structured message added to cache', {
            messageId: message.id,
            messageType,
            contentLength: content.length
        });

        return message;
    }

    /**
     * 获取当前会话的所有消息
     */
    public getCurrentMessages(): ChatMessage[] {
        return this.currentSession?.messages || [];
    }

    /**
     * 获取当前会话
     */
    public getCurrentSession(): ChatSession | null {
        return this.currentSession;
    }

    /**
     * 保存会话到文件
     */
    private saveSession(session: ChatSession): void {
        try {
            const sessionFile = path.join(this.cacheDir, `${session.id}.json`);
            const sessionData = {
                ...session,
                messages: session.messages.map(msg => ({
                    ...msg,
                    timestamp: msg.timestamp.toISOString()
                }))
            };

            fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2), 'utf8');
            logger.debug(`Session saved: ${session.id}`);
        } catch (error) {
            logger.error('Failed to save session:', error);
        }
    }

    /**
     * 从文件加载会话
     */
    private loadSession(sessionId: string): ChatSession | null {
        try {
            const sessionFile = path.join(this.cacheDir, `${sessionId}.json`);
            if (!fs.existsSync(sessionFile)) {
                return null;
            }

            const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            return {
                ...sessionData,
                createdAt: new Date(sessionData.createdAt),
                updatedAt: new Date(sessionData.updatedAt),
                messages: sessionData.messages.map((msg: any) => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp)
                }))
            };
        } catch (error) {
            logger.error(`Failed to load session ${sessionId}:`, error);
            return null;
        }
    }

    /**
     * 获取所有会话列表
     */
    public getAllSessions(): ChatSession[] {
        try {
            const sessionFiles = fs.readdirSync(this.cacheDir)
                .filter(file => file.endsWith('.json'))
                .map(file => file.replace('.json', ''));

            const sessions = sessionFiles
                .map(sessionId => this.loadSession(sessionId))
                .filter(session => session !== null) as ChatSession[];

            // 按更新时间排序
            return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        } catch (error) {
            logger.error('Failed to get all sessions:', error);
            return [];
        }
    }

    /**
     * 切换到指定会话
     */
    public switchToSession(sessionId: string): boolean {
        const session = this.loadSession(sessionId);
        if (session) {
            this.currentSession = session;
            this.context.globalState.update('currentChatSessionId', sessionId);
            logger.info(`Switched to session: ${sessionId}`);
            return true;
        }
        return false;
    }

    /**
     * 删除会话
     */
    public deleteSession(sessionId: string): boolean {
        try {
            const sessionFile = path.join(this.cacheDir, `${sessionId}.json`);
            if (fs.existsSync(sessionFile)) {
                fs.unlinkSync(sessionFile);

                // 如果删除的是当前会话，创建新会话
                if (this.currentSession?.id === sessionId) {
                    this.createNewSession();
                }

                logger.info(`Session deleted: ${sessionId}`);
                return true;
            }
            return false;
        } catch (error) {
            logger.error(`Failed to delete session ${sessionId}:`, error);
            return false;
        }
    }

    /**
     * 清空当前会话 - 彻底删除所有数据
     */
    public clearCurrentSession(): void {
        logger.info('🗑️ Starting clearCurrentSession - COMPLETE CLEANUP');

        // 1. 删除所有会话文件（彻底清理）
        try {
            const sessionFiles = fs.readdirSync(this.cacheDir);
            sessionFiles.forEach(file => {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.cacheDir, file);
                    fs.unlinkSync(filePath);
                    logger.info(`🗑️ Deleted session file: ${file}`);
                }
            });
        } catch (error) {
            logger.error('Failed to delete session files:', error);
        }

        // 2. 清除 VSCode 全局状态
        this.context.globalState.update('currentChatSessionId', undefined);
        logger.info('🗑️ Cleared currentChatSessionId from global state');

        // 3. 重置当前会话
        this.currentSession = null;

        // 4. 创建新的空会话
        this.createNewSession();
        logger.info('🗑️ Created new empty session after complete clear');
    }

    /**
     * 清空所有缓存
     */
    public clearAllCache(): void {
        try {
            const sessionFiles = fs.readdirSync(this.cacheDir);
            sessionFiles.forEach(file => {
                const filePath = path.join(this.cacheDir, file);
                fs.unlinkSync(filePath);
            });

            this.context.globalState.update('currentChatSessionId', undefined);
            this.createNewSession();

            logger.info('All chat cache cleared');
        } catch (error) {
            logger.error('Failed to clear all cache:', error);
        }
    }

    /**
     * 清理旧会话（保留最近的会话）
     */
    public cleanupOldSessions(): void {
        try {
            const sessions = this.getAllSessions();
            if (sessions.length > this.maxSessions) {
                const sessionsToDelete = sessions.slice(this.maxSessions);
                sessionsToDelete.forEach(session => {
                    this.deleteSession(session.id);
                });
                logger.info(`Cleaned up ${sessionsToDelete.length} old sessions`);
            }
        } catch (error) {
            logger.error('Failed to cleanup old sessions:', error);
        }
    }

    /**
     * 获取缓存统计信息
     */
    public getCacheStats(): { sessionCount: number; totalMessages: number; cacheSize: string } {
        try {
            const sessions = this.getAllSessions();
            const totalMessages = sessions.reduce((sum, session) => sum + session.messages.length, 0);

            // 计算缓存目录大小
            let cacheSize = 0;
            const files = fs.readdirSync(this.cacheDir);
            files.forEach(file => {
                const filePath = path.join(this.cacheDir, file);
                const stats = fs.statSync(filePath);
                cacheSize += stats.size;
            });

            return {
                sessionCount: sessions.length,
                totalMessages,
                cacheSize: `${(cacheSize / 1024).toFixed(1)} KB`
            };
        } catch (error) {
            logger.error('Failed to get cache stats:', error);
            return { sessionCount: 0, totalMessages: 0, cacheSize: '0 KB' };
        }
    }
}
