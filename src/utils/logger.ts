import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export enum LogCategory {
    GENERAL = 'general',
    CHAT = 'chat',
    AGENT = 'agent',
    TOOL = 'tool',
    AI = 'ai',
    SECURITY = 'security',
    PERFORMANCE = 'performance'
}

interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    category: LogCategory;
    message: string;
    data?: any;
    context?: string;
}

export class Logger {
    private static instance: Logger;
    private logPath: string;
    private outputChannel: vscode.OutputChannel;
    private debugMode: boolean = true; // 开发阶段开启详细日志
    private logEntries: LogEntry[] = []; // 内存中保存最近的日志条目

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('BCoder');
        this.logPath = path.join(__dirname, '../../logs/bcoder.log');

        try {
            const logDir = path.dirname(this.logPath);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            this.writeToFile(`\n=== BCoder Extension Started at ${new Date().toISOString()} ===\n`);
        } catch (error) {
            console.error('Logger init failed:', error);
        }
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private writeToFile(message: string): void {
        try {
            fs.appendFileSync(this.logPath, message);
        } catch (error) {
            // Ignore file write errors
        }
    }

    private formatMessage(level: string, category: string, message: string, data?: any, context?: string): string {
        // 使用本地时间格式，更易读
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hour = now.getHours().toString().padStart(2, '0');
        const minute = now.getMinutes().toString().padStart(2, '0');
        const second = now.getSeconds().toString().padStart(2, '0');
        const ms = now.getMilliseconds().toString().padStart(3, '0');

        const timestamp = `${year}-${month}-${day} ${hour}:${minute}:${second}.${ms}`;

        const contextStr = context ? ` [${context}]` : '';
        const dataStr = data ? ` | Data: ${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}` : '';
        return `[${timestamp}] [${level}] [${category.toUpperCase()}]${contextStr} ${message}${dataStr}\n`;
    }

    private logEntry(level: LogLevel, category: LogCategory, message: string, data?: any, context?: string): void {
        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            category,
            message,
            data,
            context
        };

        // 保存到内存（最多保留1000条）
        this.logEntries.push(entry);
        if (this.logEntries.length > 1000) {
            this.logEntries.shift();
        }

        // 格式化并输出
        const levelStr = LogLevel[level];
        const formattedMessage = this.formatMessage(levelStr, category, message, data, context);

        // 输出到控制台
        if (this.debugMode || level >= LogLevel.INFO) {
            const consoleMethod = level === LogLevel.ERROR ? console.error :
                                level === LogLevel.WARN ? console.warn :
                                level === LogLevel.DEBUG ? console.debug : console.log;
            consoleMethod(`[${category.toUpperCase()}] ${message}`, data || '');
        }

        // 输出到 VSCode 输出面板
        const outputMessage = `[${levelStr}] [${category.toUpperCase()}]${context ? ` [${context}]` : ''} ${message}`;
        this.outputChannel.appendLine(outputMessage);
        if (data && typeof data === 'object') {
            this.outputChannel.appendLine(`  Data: ${JSON.stringify(data, null, 2)}`);
        }

        // 写入文件
        this.writeToFile(formattedMessage);
    }

    // 保持向后兼容的原有方法
    public info(message: string, ...args: any[]): void {
        this.logEntry(LogLevel.INFO, LogCategory.GENERAL, message, args.length > 0 ? args : undefined);
    }

    public warn(message: string, ...args: any[]): void {
        this.logEntry(LogLevel.WARN, LogCategory.GENERAL, message, args.length > 0 ? args : undefined);
    }

    public error(message: string, error?: any, ...args: any[]): void {
        const errorData = error ? { error: error.stack || error.message || error, args } : { args };
        this.logEntry(LogLevel.ERROR, LogCategory.GENERAL, message, errorData);
    }

    public debug(message: string, ...args: any[]): void {
        this.logEntry(LogLevel.DEBUG, LogCategory.GENERAL, message, args.length > 0 ? args : undefined);
    }

    // 新的分类日志方法
    public chat(message: string, data?: any, context?: string): void {
        this.logEntry(LogLevel.INFO, LogCategory.CHAT, message, data, context);
    }

    public chatDebug(message: string, data?: any, context?: string): void {
        this.logEntry(LogLevel.DEBUG, LogCategory.CHAT, message, data, context);
    }

    public agent(message: string, data?: any, context?: string): void {
        this.logEntry(LogLevel.INFO, LogCategory.AGENT, message, data, context);
    }

    public agentDebug(message: string, data?: any, context?: string): void {
        this.logEntry(LogLevel.DEBUG, LogCategory.AGENT, message, data, context);
    }

    public tool(message: string, data?: any, context?: string): void {
        this.logEntry(LogLevel.INFO, LogCategory.TOOL, message, data, context);
    }

    public toolDebug(message: string, data?: any, context?: string): void {
        this.logEntry(LogLevel.DEBUG, LogCategory.TOOL, message, data, context);
    }

    public ai(message: string, data?: any, context?: string): void {
        this.logEntry(LogLevel.INFO, LogCategory.AI, message, data, context);
    }

    public aiDebug(message: string, data?: any, context?: string): void {
        this.logEntry(LogLevel.DEBUG, LogCategory.AI, message, data, context);
    }

    public security(message: string, data?: any, context?: string): void {
        this.logEntry(LogLevel.WARN, LogCategory.SECURITY, message, data, context);
    }

    public performance(message: string, data?: any, context?: string): void {
        this.logEntry(LogLevel.INFO, LogCategory.PERFORMANCE, message, data, context);
    }

    // 实用的调试方法
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        this.info(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    public getRecentLogs(category?: LogCategory, count: number = 50): LogEntry[] {
        let logs = this.logEntries;
        if (category) {
            logs = logs.filter(entry => entry.category === category);
        }
        return logs.slice(-count);
    }

    public dumpLogs(category?: LogCategory): string {
        const logs = this.getRecentLogs(category, 100);
        const header = `BCoder 日志导出 - ${new Date().toLocaleString('zh-CN')} (本地时间)\n${'='.repeat(80)}\n\n`;
        const logContent = logs.map(entry => {
            // 使用本地时间格式，更易读
            const now = entry.timestamp;
            const year = now.getFullYear();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const day = now.getDate().toString().padStart(2, '0');
            const hour = now.getHours().toString().padStart(2, '0');
            const minute = now.getMinutes().toString().padStart(2, '0');
            const second = now.getSeconds().toString().padStart(2, '0');
            const ms = now.getMilliseconds().toString().padStart(3, '0');

            const timestamp = `${year}-${month}-${day} ${hour}:${minute}:${second}.${ms}`;

            const level = LogLevel[entry.level];
            const contextStr = entry.context ? ` [${entry.context}]` : '';
            const dataStr = entry.data ? ` | ${JSON.stringify(entry.data)}` : '';
            return `[${timestamp}] [${level}] [${entry.category.toUpperCase()}]${contextStr} ${entry.message}${dataStr}`;
        }).join('\n');

        return header + logContent;
    }

    public clearLogs(): void {
        this.logEntries = [];
        this.info('Log entries cleared');
    }

    // 性能计时器
    private timers: Map<string, number> = new Map();

    public startTimer(name: string): void {
        this.timers.set(name, Date.now());
        this.performance(`Timer started: ${name}`);
    }

    public endTimer(name: string, context?: string): number {
        const startTime = this.timers.get(name);
        if (!startTime) {
            this.warn(`Timer '${name}' not found`);
            return 0;
        }

        const duration = Date.now() - startTime;
        this.timers.delete(name);
        this.performance(`Timer ended: ${name} - ${duration}ms`, { duration }, context);
        return duration;
    }

    // 专门的 Agent 工作流日志
    public agentTaskStart(taskId: string, description: string, data?: any): void {
        this.agent(`Task started: ${description}`, { taskId, ...data }, `Task-${taskId}`);
    }

    public agentTaskEnd(taskId: string, success: boolean, data?: any): void {
        this.agent(`Task ${success ? 'completed' : 'failed'}: ${taskId}`, { success, ...data }, `Task-${taskId}`);
    }

    public agentStep(taskId: string, stepId: string, action: string, data?: any): void {
        this.agentDebug(`Step: ${action}`, { taskId, stepId, ...data }, `Task-${taskId}`);
    }

    public agentPlan(taskId: string, plan: any): void {
        this.agent(`Plan created for task: ${taskId}`, { plan }, `Task-${taskId}`);
    }

    public agentReflection(taskId: string, reflection: any): void {
        this.agent(`Reflection for task: ${taskId}`, { reflection }, `Task-${taskId}`);
    }

    // 专门的聊天日志
    public chatUserInput(message: string, context?: any): void {
        this.chat('User input received', { message: message.substring(0, 100), context }, 'UserInput');
    }

    public chatAIResponse(response: string, context?: any): void {
        this.chat('AI response generated', {
            responseLength: response.length,
            preview: response.substring(0, 100),
            context
        }, 'AIResponse');
    }

    public chatToolCall(toolName: string, parameters: any, context?: string): void {
        this.chat(`Tool called: ${toolName}`, { parameters }, context || 'ToolCall');
    }

    public chatToolResult(toolName: string, success: boolean, data?: any, context?: string): void {
        this.chat(`Tool result: ${toolName} - ${success ? 'success' : 'failed'}`, {
            success,
            dataSize: data ? JSON.stringify(data).length : 0
        }, context || 'ToolResult');
    }

    public show(): void {
        this.outputChannel.show();
    }

    public getLogPath(): string {
        return this.logPath;
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
}

export const logger = Logger.getInstance();
