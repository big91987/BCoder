import * as vscode from 'vscode';
import axios from 'axios';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export class AIClient {
    private apiEndpoint: string = '';
    private apiKey: string = '';
    private isLocalMode: boolean = true;

    constructor() {
        this.updateConfiguration();

        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('bcoder')) {
                this.updateConfiguration();
            }
        });
    }

    private updateConfiguration(): void {
        const config = vscode.workspace.getConfiguration('bcoder');
        this.apiEndpoint = config.get('apiEndpoint', '');
        this.apiKey = config.get('apiKey', '');
        this.isLocalMode = !this.apiEndpoint || !this.apiKey;
    }

    async chat(prompt: string, history: ChatMessage[] = []): Promise<string> {
        if (this.isLocalMode) {
            return this.localChat(prompt, history);
        } else {
            return this.apiChat(prompt, history);
        }
    }

    async complete(prompt: string): Promise<string> {
        if (this.isLocalMode) {
            return this.localComplete(prompt);
        } else {
            return this.apiComplete(prompt);
        }
    }

    private async localChat(prompt: string, history: ChatMessage[] = []): Promise<string> {
        // Local mode - provide rule-based responses
        const lowerPrompt = prompt.toLowerCase();

        // Code explanation patterns
        if (lowerPrompt.includes('explain') || lowerPrompt.includes('what does')) {
            return this.generateExplanation(prompt);
        }

        // Code generation patterns
        if (lowerPrompt.includes('generate') || lowerPrompt.includes('create') || lowerPrompt.includes('write')) {
            return this.generateCode(prompt);
        }

        // Error fixing patterns
        if (lowerPrompt.includes('error') || lowerPrompt.includes('fix') || lowerPrompt.includes('debug')) {
            return this.suggestFix(prompt);
        }

        // General programming questions
        if (lowerPrompt.includes('how to') || lowerPrompt.includes('how do')) {
            return this.answerHowTo(prompt);
        }

        // Default response
        return this.generateDefaultResponse(prompt);
    }

    private async localComplete(prompt: string): Promise<string> {
        // Simple local completion based on patterns
        const lines = prompt.split('\n');
        const lastLine = lines[lines.length - 1];

        // Function completion
        if (lastLine.includes('function') || lastLine.includes('def')) {
            return 'name(parameters) {\n    // implementation\n}';
        }

        // If statement completion
        if (lastLine.includes('if')) {
            return '(condition) {\n    // code\n}';
        }

        // For loop completion
        if (lastLine.includes('for')) {
            return '(let i = 0; i < length; i++) {\n    // code\n}';
        }

        // Class completion
        if (lastLine.includes('class')) {
            return 'ClassName {\n    constructor() {\n        // initialization\n    }\n}';
        }

        // Variable assignment
        if (lastLine.includes('=') && !lastLine.includes('==')) {
            return 'value;';
        }

        return 'completion';
    }

    private async apiChat(prompt: string, history: ChatMessage[] = []): Promise<string> {
        try {
            const messages: ChatMessage[] = [
                {
                    role: 'system',
                    content: 'You are BCoder, a helpful AI coding assistant. Provide clear, accurate, and helpful responses about programming and software development.'
                },
                ...history.slice(-10), // Keep last 10 messages for context
                {
                    role: 'user',
                    content: prompt
                }
            ];

            const response = await axios.post(this.apiEndpoint, {
                messages: messages,
                max_tokens: 1000,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('API chat error:', error);
            // Fallback to local mode
            return this.localChat(prompt, history);
        }
    }

    private async apiComplete(prompt: string): Promise<string> {
        try {
            const response = await axios.post(this.apiEndpoint, {
                prompt: prompt,
                max_tokens: 100,
                temperature: 0.3,
                stop: ['\n\n']
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            return response.data.choices[0].text;
        } catch (error) {
            console.error('API completion error:', error);
            // Fallback to local mode
            return this.localComplete(prompt);
        }
    }

    private generateExplanation(prompt: string): string {
        return `This code appears to be performing the following operations:

1. **Main functionality**: The code implements a specific algorithm or function
2. **Key components**: It uses various programming constructs like variables, functions, and control structures
3. **Purpose**: The code is designed to solve a particular problem or perform a specific task

**How it works**:
- The code follows a logical sequence of operations
- It processes input data and produces output
- It may use common programming patterns and best practices

**Considerations**:
- The code should be tested thoroughly
- Consider edge cases and error handling
- Performance optimization may be needed for large datasets

For a more detailed explanation, please provide the specific code you'd like me to analyze.`;
    }

    private generateCode(prompt: string): string {
        const lowerPrompt = prompt.toLowerCase();

        if (lowerPrompt.includes('function')) {
            return `// Generated function based on your request
function exampleFunction(parameter) {
    // Implementation goes here
    return result;
}

// Usage example:
const result = exampleFunction(inputValue);`;
        }

        if (lowerPrompt.includes('class')) {
            return `// Generated class based on your request
class ExampleClass {
    constructor(parameter) {
        this.property = parameter;
    }

    method() {
        // Method implementation
        return this.property;
    }
}

// Usage example:
const instance = new ExampleClass(value);`;
        }

        return `// Generated code based on your request
// Please provide more specific requirements for better code generation

const example = {
    // Your code structure here
};`;
    }

    private suggestFix(prompt: string): string {
        return `Here are some common solutions for debugging issues:

**1. Check for syntax errors**:
- Missing semicolons, brackets, or parentheses
- Incorrect indentation
- Typos in variable or function names

**2. Verify variable scope**:
- Ensure variables are declared before use
- Check if variables are accessible in the current scope

**3. Review logic errors**:
- Verify conditional statements
- Check loop conditions and iterations
- Ensure correct data types

**4. Use debugging tools**:
- Add console.log statements to track values
- Use breakpoints in your IDE
- Check browser developer tools for errors

**5. Test with sample data**:
- Use simple test cases first
- Gradually increase complexity

Please share the specific error message and code for more targeted assistance.`;
    }

    private answerHowTo(prompt: string): string {
        return `Here's a general approach to solve your programming question:

**Step 1: Understand the problem**
- Break down what you're trying to achieve
- Identify the inputs and expected outputs

**Step 2: Plan your solution**
- Choose the appropriate data structures
- Outline the algorithm or approach

**Step 3: Implement the solution**
- Write clean, readable code
- Add comments to explain complex logic

**Step 4: Test and refine**
- Test with various inputs
- Handle edge cases and errors

**Step 5: Optimize if needed**
- Improve performance if necessary
- Refactor for better maintainability

For more specific guidance, please provide details about what you're trying to accomplish.`;
    }

    private generateDefaultResponse(prompt: string): string {
        return `I understand you're asking about: "${prompt}"

As your AI coding assistant, I'm here to help with:
- Code explanations and analysis
- Code generation and examples
- Debugging and error fixing
- Best practices and optimization
- Programming concepts and tutorials

Please feel free to ask more specific questions about:
- A particular programming language
- A specific coding problem
- Code review or improvement suggestions
- Implementation of algorithms or features

How can I assist you with your coding needs today?`;
    }
}
