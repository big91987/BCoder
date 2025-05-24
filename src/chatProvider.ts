import * as vscode from 'vscode';
import { AIClient } from './utils/aiClient';

export class ChatProvider {
    private aiClient: AIClient;
    private conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [];

    constructor(aiClient: AIClient) {
        this.aiClient = aiClient;
    }

    async askQuestion(question: string): Promise<string> {
        try {
            // Add user question to history
            this.conversationHistory.push({ role: 'user', content: question });

            // Get current workspace context
            const workspaceContext = await this.getWorkspaceContext();
            
            // Prepare the prompt with context
            const prompt = this.buildPrompt(question, workspaceContext);
            
            // Get AI response
            const response = await this.aiClient.chat(prompt, this.conversationHistory);
            
            // Add assistant response to history
            this.conversationHistory.push({ role: 'assistant', content: response });
            
            // Limit conversation history to prevent token overflow
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-20);
            }

            return response;
        } catch (error) {
            console.error('Error in askQuestion:', error);
            return 'Sorry, I encountered an error while processing your question. Please try again.';
        }
    }

    async explainCode(code: string): Promise<string> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            const language = activeEditor?.document.languageId || 'unknown';
            
            const prompt = `Please explain the following ${language} code in detail:

\`\`\`${language}
${code}
\`\`\`

Provide a clear explanation that covers:
1. What the code does
2. How it works
3. Any important concepts or patterns used
4. Potential improvements or considerations`;

            const response = await this.aiClient.chat(prompt);
            return response;
        } catch (error) {
            console.error('Error in explainCode:', error);
            return 'Sorry, I encountered an error while explaining the code. Please try again.';
        }
    }

    async generateCode(prompt: string, language: string): Promise<string> {
        try {
            const fullPrompt = `Generate ${language} code for the following request:

${prompt}

Please provide clean, well-commented code that follows best practices for ${language}.
Only return the code without additional explanations.`;

            const response = await this.aiClient.chat(fullPrompt);
            
            // Extract code from response if it's wrapped in markdown
            const codeMatch = response.match(/```[\w]*\n([\s\S]*?)\n```/);
            if (codeMatch) {
                return codeMatch[1];
            }
            
            return response;
        } catch (error) {
            console.error('Error in generateCode:', error);
            return `// Error generating code: ${error}`;
        }
    }

    async suggestFix(error: string, code: string): Promise<string> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            const language = activeEditor?.document.languageId || 'unknown';
            
            const prompt = `I'm getting the following error in my ${language} code:

Error: ${error}

Code:
\`\`\`${language}
${code}
\`\`\`

Please suggest a fix for this error. Provide the corrected code and explain what was wrong.`;

            const response = await this.aiClient.chat(prompt);
            return response;
        } catch (error) {
            console.error('Error in suggestFix:', error);
            return 'Sorry, I encountered an error while suggesting a fix. Please try again.';
        }
    }

    async optimizeCode(code: string): Promise<string> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            const language = activeEditor?.document.languageId || 'unknown';
            
            const prompt = `Please optimize the following ${language} code for better performance, readability, and maintainability:

\`\`\`${language}
${code}
\`\`\`

Provide the optimized code along with explanations of the improvements made.`;

            const response = await this.aiClient.chat(prompt);
            return response;
        } catch (error) {
            console.error('Error in optimizeCode:', error);
            return 'Sorry, I encountered an error while optimizing the code. Please try again.';
        }
    }

    private buildPrompt(question: string, workspaceContext: string): string {
        return `You are BCoder, an AI coding assistant. Help the user with their programming question.

Current workspace context:
${workspaceContext}

User question: ${question}

Please provide a helpful and accurate response. If the question is about code, provide examples when appropriate.`;
    }

    private async getWorkspaceContext(): Promise<string> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                return 'No active file';
            }

            const document = activeEditor.document;
            const language = document.languageId;
            const fileName = document.fileName;
            const lineCount = document.lineCount;
            
            // Get current selection or cursor position
            const selection = activeEditor.selection;
            const currentLine = selection.active.line + 1;
            
            // Get a snippet of the current file (around cursor position)
            const startLine = Math.max(0, currentLine - 10);
            const endLine = Math.min(lineCount, currentLine + 10);
            const snippet = document.getText(new vscode.Range(startLine, 0, endLine, 0));

            return `File: ${fileName}
Language: ${language}
Current line: ${currentLine}
Total lines: ${lineCount}

Code snippet around cursor:
\`\`\`${language}
${snippet}
\`\`\``;
        } catch (error) {
            console.error('Error getting workspace context:', error);
            return 'Unable to get workspace context';
        }
    }

    clearHistory(): void {
        this.conversationHistory = [];
    }

    getHistory(): Array<{role: 'user' | 'assistant', content: string}> {
        return [...this.conversationHistory];
    }
}
