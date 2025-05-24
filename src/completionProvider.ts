import * as vscode from 'vscode';
import { AIClient } from './utils/aiClient';

export class CompletionProvider implements vscode.CompletionItemProvider {
    private aiClient: AIClient;
    private completionCache: Map<string, vscode.CompletionItem[]> = new Map();

    constructor(aiClient: AIClient) {
        this.aiClient = aiClient;
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[]> {
        // Check if auto completion is enabled
        const config = vscode.workspace.getConfiguration('bcoder');
        if (!config.get('autoCompletion', true)) {
            return [];
        }

        // Get the current line and context
        const line = document.lineAt(position);
        const linePrefix = line.text.substring(0, position.character);
        const lineText = line.text;

        // Skip if the line is empty or just whitespace
        if (linePrefix.trim().length === 0) {
            return [];
        }

        // Get surrounding context (previous and next lines)
        const contextLines = this.getContextLines(document, position, 5);
        const language = document.languageId;

        // Create cache key
        const cacheKey = `${language}:${linePrefix}:${contextLines}`;
        
        // Check cache first
        if (this.completionCache.has(cacheKey)) {
            return this.completionCache.get(cacheKey) || [];
        }

        try {
            // Get AI-powered completions
            const completions = await this.getAICompletions(
                linePrefix,
                contextLines,
                language,
                position
            );

            // Add basic language-specific completions
            const basicCompletions = this.getBasicCompletions(linePrefix, language);
            
            const allCompletions = [...completions, ...basicCompletions];
            
            // Cache the results
            this.completionCache.set(cacheKey, allCompletions);
            
            // Clean cache if it gets too large
            if (this.completionCache.size > 100) {
                const firstKey = this.completionCache.keys().next().value;
                this.completionCache.delete(firstKey);
            }

            return allCompletions;
        } catch (error) {
            console.error('Error getting completions:', error);
            // Fallback to basic completions
            return this.getBasicCompletions(linePrefix, language);
        }
    }

    private getContextLines(document: vscode.TextDocument, position: vscode.Position, count: number): string {
        const startLine = Math.max(0, position.line - count);
        const endLine = Math.min(document.lineCount - 1, position.line + count);
        
        let context = '';
        for (let i = startLine; i <= endLine; i++) {
            if (i !== position.line) {
                context += document.lineAt(i).text + '\n';
            }
        }
        return context;
    }

    private async getAICompletions(
        linePrefix: string,
        context: string,
        language: string,
        position: vscode.Position
    ): Promise<vscode.CompletionItem[]> {
        const prompt = `Complete the following ${language} code:

Context:
${context}

Current line: ${linePrefix}

Provide 3-5 relevant completions. Each completion should be a single word or short phrase that would logically continue the current line.`;

        try {
            const response = await this.aiClient.complete(prompt);
            return this.parseCompletionResponse(response, linePrefix);
        } catch (error) {
            console.error('AI completion failed:', error);
            return [];
        }
    }

    private parseCompletionResponse(response: string, linePrefix: string): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        const lines = response.split('\n').filter(line => line.trim());

        for (const line of lines.slice(0, 5)) { // Limit to 5 completions
            const cleanLine = line.replace(/^[-*]\s*/, '').trim();
            if (cleanLine && cleanLine.length > 0) {
                const completion = new vscode.CompletionItem(
                    cleanLine,
                    vscode.CompletionItemKind.Text
                );
                completion.detail = 'BCoder AI Suggestion';
                completion.documentation = new vscode.MarkdownString(`AI-generated completion for: \`${linePrefix}\``);
                completion.sortText = '0' + cleanLine; // Prioritize AI suggestions
                completions.push(completion);
            }
        }

        return completions;
    }

    private getBasicCompletions(linePrefix: string, language: string): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];

        // Language-specific keywords and patterns
        const languageKeywords = this.getLanguageKeywords(language);
        const patterns = this.getCommonPatterns(language);

        // Add keyword completions
        for (const keyword of languageKeywords) {
            if (keyword.toLowerCase().startsWith(linePrefix.toLowerCase().split(/\s+/).pop() || '')) {
                const completion = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                completion.detail = `${language} keyword`;
                completion.sortText = '1' + keyword;
                completions.push(completion);
            }
        }

        // Add pattern completions
        for (const pattern of patterns) {
            if (this.matchesPattern(linePrefix, pattern.trigger)) {
                const completion = new vscode.CompletionItem(pattern.completion, vscode.CompletionItemKind.Snippet);
                completion.detail = pattern.description;
                completion.insertText = new vscode.SnippetString(pattern.snippet);
                completion.sortText = '2' + pattern.completion;
                completions.push(completion);
            }
        }

        return completions;
    }

    private getLanguageKeywords(language: string): string[] {
        const keywords: { [key: string]: string[] } = {
            javascript: ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'class', 'import', 'export'],
            typescript: ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'class', 'import', 'export', 'interface', 'type'],
            python: ['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return', 'import', 'from', 'try', 'except'],
            java: ['public', 'private', 'protected', 'class', 'interface', 'if', 'else', 'for', 'while', 'return', 'import'],
            csharp: ['public', 'private', 'protected', 'class', 'interface', 'if', 'else', 'for', 'while', 'return', 'using'],
            cpp: ['#include', 'class', 'struct', 'if', 'else', 'for', 'while', 'return', 'namespace'],
            go: ['func', 'var', 'const', 'if', 'else', 'for', 'return', 'package', 'import', 'struct', 'interface']
        };

        return keywords[language] || [];
    }

    private getCommonPatterns(language: string): Array<{trigger: string, completion: string, snippet: string, description: string}> {
        const patterns: { [key: string]: Array<{trigger: string, completion: string, snippet: string, description: string}> } = {
            javascript: [
                { trigger: 'func', completion: 'function', snippet: 'function ${1:name}(${2:params}) {\n\t${3:// body}\n}', description: 'Function declaration' },
                { trigger: 'if', completion: 'if statement', snippet: 'if (${1:condition}) {\n\t${2:// body}\n}', description: 'If statement' },
                { trigger: 'for', completion: 'for loop', snippet: 'for (let ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n\t${3:// body}\n}', description: 'For loop' }
            ],
            python: [
                { trigger: 'def', completion: 'function', snippet: 'def ${1:name}(${2:params}):\n\t${3:pass}', description: 'Function definition' },
                { trigger: 'if', completion: 'if statement', snippet: 'if ${1:condition}:\n\t${2:pass}', description: 'If statement' },
                { trigger: 'for', completion: 'for loop', snippet: 'for ${1:item} in ${2:iterable}:\n\t${3:pass}', description: 'For loop' }
            ]
        };

        return patterns[language] || [];
    }

    private matchesPattern(linePrefix: string, trigger: string): boolean {
        return linePrefix.trim().endsWith(trigger);
    }
}
