import * as vscode from 'vscode';

export interface CodeSymbol {
    name: string;
    kind: vscode.SymbolKind;
    range: vscode.Range;
    detail?: string;
}

export interface CodeContext {
    currentFunction?: string;
    currentClass?: string;
    imports: string[];
    variables: string[];
    functions: string[];
    classes: string[];
}

export class CodeParser {
    
    static async getDocumentSymbols(document: vscode.TextDocument): Promise<CodeSymbol[]> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );
            
            if (!symbols) {
                return [];
            }
            
            return this.flattenSymbols(symbols);
        } catch (error) {
            console.error('Error getting document symbols:', error);
            return [];
        }
    }
    
    static flattenSymbols(symbols: vscode.DocumentSymbol[]): CodeSymbol[] {
        const result: CodeSymbol[] = [];
        
        for (const symbol of symbols) {
            result.push({
                name: symbol.name,
                kind: symbol.kind,
                range: symbol.range,
                detail: symbol.detail
            });
            
            if (symbol.children) {
                result.push(...this.flattenSymbols(symbol.children));
            }
        }
        
        return result;
    }
    
    static async getCodeContext(document: vscode.TextDocument, position: vscode.Position): Promise<CodeContext> {
        const context: CodeContext = {
            imports: [],
            variables: [],
            functions: [],
            classes: []
        };
        
        try {
            const symbols = await this.getDocumentSymbols(document);
            
            // Find current function and class
            for (const symbol of symbols) {
                if (symbol.range.contains(position)) {
                    if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
                        context.currentFunction = symbol.name;
                    } else if (symbol.kind === vscode.SymbolKind.Class) {
                        context.currentClass = symbol.name;
                    }
                }
                
                // Collect all symbols by type
                switch (symbol.kind) {
                    case vscode.SymbolKind.Function:
                    case vscode.SymbolKind.Method:
                        context.functions.push(symbol.name);
                        break;
                    case vscode.SymbolKind.Class:
                        context.classes.push(symbol.name);
                        break;
                    case vscode.SymbolKind.Variable:
                    case vscode.SymbolKind.Field:
                        context.variables.push(symbol.name);
                        break;
                }
            }
            
            // Parse imports (language-specific)
            context.imports = this.parseImports(document);
            
        } catch (error) {
            console.error('Error getting code context:', error);
        }
        
        return context;
    }
    
    static parseImports(document: vscode.TextDocument): string[] {
        const imports: string[] = [];
        const language = document.languageId;
        const text = document.getText();
        
        switch (language) {
            case 'javascript':
            case 'typescript':
                // Match import statements
                const jsImportRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
                const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
                
                let match;
                while ((match = jsImportRegex.exec(text)) !== null) {
                    imports.push(match[1]);
                }
                while ((match = requireRegex.exec(text)) !== null) {
                    imports.push(match[1]);
                }
                break;
                
            case 'python':
                // Match import statements
                const pyImportRegex = /(?:from\s+(\S+)\s+)?import\s+([^\n]+)/g;
                while ((match = pyImportRegex.exec(text)) !== null) {
                    if (match[1]) {
                        imports.push(match[1]);
                    }
                    const importedItems = match[2].split(',').map(item => item.trim());
                    imports.push(...importedItems);
                }
                break;
                
            case 'java':
                // Match import statements
                const javaImportRegex = /import\s+(?:static\s+)?([^;]+);/g;
                while ((match = javaImportRegex.exec(text)) !== null) {
                    imports.push(match[1]);
                }
                break;
                
            case 'csharp':
                // Match using statements
                const csUsingRegex = /using\s+([^;]+);/g;
                while ((match = csUsingRegex.exec(text)) !== null) {
                    imports.push(match[1]);
                }
                break;
        }
        
        return imports;
    }
    
    static getLineContext(document: vscode.TextDocument, position: vscode.Position): {
        currentLine: string;
        previousLines: string[];
        nextLines: string[];
        indentation: string;
    } {
        const currentLine = document.lineAt(position).text;
        const indentation = currentLine.match(/^\s*/)?.[0] || '';
        
        const previousLines: string[] = [];
        const nextLines: string[] = [];
        
        // Get previous lines (up to 5)
        for (let i = Math.max(0, position.line - 5); i < position.line; i++) {
            previousLines.push(document.lineAt(i).text);
        }
        
        // Get next lines (up to 5)
        for (let i = position.line + 1; i < Math.min(document.lineCount, position.line + 6); i++) {
            nextLines.push(document.lineAt(i).text);
        }
        
        return {
            currentLine,
            previousLines,
            nextLines,
            indentation
        };
    }
    
    static extractVariables(text: string, language: string): string[] {
        const variables: string[] = [];
        
        switch (language) {
            case 'javascript':
            case 'typescript':
                // Match variable declarations
                const jsVarRegex = /(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
                let match;
                while ((match = jsVarRegex.exec(text)) !== null) {
                    variables.push(match[1]);
                }
                break;
                
            case 'python':
                // Match variable assignments (simple heuristic)
                const pyVarRegex = /^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*=/gm;
                while ((match = pyVarRegex.exec(text)) !== null) {
                    variables.push(match[2]);
                }
                break;
                
            case 'java':
            case 'csharp':
                // Match variable declarations
                const javaVarRegex = /(?:private|public|protected|static)?\s*\w+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[=;]/g;
                while ((match = javaVarRegex.exec(text)) !== null) {
                    variables.push(match[1]);
                }
                break;
        }
        
        return [...new Set(variables)]; // Remove duplicates
    }
    
    static extractFunctions(text: string, language: string): string[] {
        const functions: string[] = [];
        
        switch (language) {
            case 'javascript':
            case 'typescript':
                // Match function declarations
                const jsFuncRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
                const arrowFuncRegex = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:\([^)]*\)\s*)?=>/g;
                
                let match;
                while ((match = jsFuncRegex.exec(text)) !== null) {
                    functions.push(match[1]);
                }
                while ((match = arrowFuncRegex.exec(text)) !== null) {
                    functions.push(match[1]);
                }
                break;
                
            case 'python':
                // Match function definitions
                const pyFuncRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
                while ((match = pyFuncRegex.exec(text)) !== null) {
                    functions.push(match[1]);
                }
                break;
                
            case 'java':
            case 'csharp':
                // Match method declarations
                const javaMethodRegex = /(?:public|private|protected|static)?\s*\w+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
                while ((match = javaMethodRegex.exec(text)) !== null) {
                    functions.push(match[1]);
                }
                break;
        }
        
        return [...new Set(functions)]; // Remove duplicates
    }
    
    static isInString(document: vscode.TextDocument, position: vscode.Position): boolean {
        const line = document.lineAt(position).text;
        const char = position.character;
        
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let inBacktick = false;
        
        for (let i = 0; i < char; i++) {
            const c = line[i];
            const prev = i > 0 ? line[i - 1] : '';
            
            if (c === "'" && prev !== '\\') {
                inSingleQuote = !inSingleQuote;
            } else if (c === '"' && prev !== '\\') {
                inDoubleQuote = !inDoubleQuote;
            } else if (c === '`' && prev !== '\\') {
                inBacktick = !inBacktick;
            }
        }
        
        return inSingleQuote || inDoubleQuote || inBacktick;
    }
    
    static isInComment(document: vscode.TextDocument, position: vscode.Position): boolean {
        const line = document.lineAt(position).text;
        const language = document.languageId;
        
        switch (language) {
            case 'javascript':
            case 'typescript':
            case 'java':
            case 'csharp':
                return line.includes('//') && position.character > line.indexOf('//');
            case 'python':
                return line.includes('#') && position.character > line.indexOf('#');
            default:
                return false;
        }
    }
}
