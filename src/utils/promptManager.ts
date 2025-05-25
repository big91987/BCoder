import * as fs from 'fs';
import * as path from 'path';

export class PromptManager {
    private static instance: PromptManager;
    private promptsPath: string;
    private promptCache: Map<string, string> = new Map();

    private constructor() {
        this.promptsPath = path.join(__dirname, '../../prompts');
    }

    public static getInstance(): PromptManager {
        if (!PromptManager.instance) {
            PromptManager.instance = new PromptManager();
        }
        return PromptManager.instance;
    }

    private loadPrompt(filename: string): string {
        if (this.promptCache.has(filename)) {
            return this.promptCache.get(filename)!;
        }

        try {
            const filePath = path.join(this.promptsPath, filename);
            const content = fs.readFileSync(filePath, 'utf-8');
            this.promptCache.set(filename, content);
            return content;
        } catch (error) {
            console.error(`Failed to load prompt file: ${filename}`, error);
            return '';
        }
    }

    public getSystemPrompt(): string {
        return this.loadPrompt('system.md');
    }

    public getChatPrompt(question: string, workspaceContext: string): string {
        const template = this.loadPrompt('chat.md');
        return template
            .replace('{question}', question)
            .replace('{workspaceContext}', workspaceContext);
    }

    public getExplainCodePrompt(code: string, language: string): string {
        const template = this.loadPrompt('explain-code.md');
        return template
            .replace(/{code}/g, code)
            .replace(/{language}/g, language);
    }

    public getGenerateCodePrompt(prompt: string, language: string): string {
        const template = this.loadPrompt('generate-code.md');
        return template
            .replace('{prompt}', prompt)
            .replace(/{language}/g, language);
    }

    public reloadPrompts(): void {
        this.promptCache.clear();
    }
}

export const promptManager = PromptManager.getInstance();
