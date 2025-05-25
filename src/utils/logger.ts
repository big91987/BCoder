import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class Logger {
    private static instance: Logger;
    private logPath: string;
    private outputChannel: vscode.OutputChannel;

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

    private formatMessage(level: string, message: string, ...args: any[]): string {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ' ' + args.join(' ') : '';
        return `[${timestamp}] [${level}] ${message}${formattedArgs}\n`;
    }

    public info(message: string, ...args: any[]): void {
        const formattedMessage = this.formatMessage('INFO', message, ...args);
        console.log(message, ...args);
        this.outputChannel.appendLine(`[INFO] ${message} ${args.join(' ')}`);
        this.writeToFile(formattedMessage);
    }

    public warn(message: string, ...args: any[]): void {
        const formattedMessage = this.formatMessage('WARN', message, ...args);
        console.warn(message, ...args);
        this.outputChannel.appendLine(`[WARN] ${message} ${args.join(' ')}`);
        this.writeToFile(formattedMessage);
    }

    public error(message: string, error?: any, ...args: any[]): void {
        const errorInfo = error ? (error.stack || error.message || error) : '';
        const formattedMessage = this.formatMessage('ERROR', message, errorInfo, ...args);
        console.error(message, error, ...args);
        this.outputChannel.appendLine(`[ERROR] ${message} ${errorInfo} ${args.join(' ')}`);
        this.writeToFile(formattedMessage);
    }

    public debug(message: string, ...args: any[]): void {
        const formattedMessage = this.formatMessage('DEBUG', message, ...args);
        console.debug(message, ...args);
        this.outputChannel.appendLine(`[DEBUG] ${message} ${args.join(' ')}`);
        this.writeToFile(formattedMessage);
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
