import * as vscode from 'vscode';
import axios from 'axios';
import { promptManager } from './promptManager';
import { logger } from './logger';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export class AIClient {
    private apiEndpoint: string = '';
    private apiKey: string = '';

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
        let endpoint = config.get('apiEndpoint', 'https://ark.cn-beijing.volces.com/api/v3/chat/completions');

        // 强制修复 endpoint - 如果缺少 /chat/completions 就添加
        if (endpoint === 'https://ark.cn-beijing.volces.com/api/v3') {
            endpoint = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
        }

        this.apiEndpoint = endpoint;
        this.apiKey = config.get('apiKey', 'e51c57a1-d4de-4572-8387-2a9dc93fff52');
    }

    async chat(prompt: string, history: ChatMessage[] = []): Promise<string> {
        console.log('AIClient.chat called');
        console.log('apiEndpoint:', this.apiEndpoint);
        console.log('apiKey:', this.apiKey ? 'configured' : 'not configured');

        if (!this.apiEndpoint || !this.apiKey) {
            throw new Error('API endpoint and API key must be configured. Please go to Settings to configure them.');
        }

        console.log('Using API chat mode');
        return this.apiChat(prompt, history);
    }

    async chatStream(prompt: string, history: ChatMessage[] = [], onChunk: (chunk: string) => void): Promise<string> {
        if (!this.apiEndpoint || !this.apiKey) {
            throw new Error('API endpoint and API key must be configured. Please go to Settings to configure them.');
        }

        return this.apiChatStream(prompt, history, onChunk);
    }

    async complete(prompt: string): Promise<string> {
        if (!this.apiEndpoint || !this.apiKey) {
            throw new Error('API endpoint and API key must be configured. Please go to Settings to configure them.');
        }

        return this.apiComplete(prompt);
    }



    private async apiChat(prompt: string, history: ChatMessage[] = []): Promise<string> {
        try {
            logger.info('=== API Chat Debug Info ===');
            logger.info('apiEndpoint:', this.apiEndpoint);
            logger.info('apiKey:', this.apiKey ? this.apiKey.substring(0, 8) + '...' : 'not set');

            const messages: ChatMessage[] = [
                {
                    role: 'system',
                    content: promptManager.getSystemPrompt()
                },
                ...history.slice(-10), // Keep last 10 messages for context
                {
                    role: 'user',
                    content: prompt
                }
            ];

            logger.info('Sending request to:', this.apiEndpoint);
            const response = await axios.post(this.apiEndpoint, {
                model: 'doubao-1-5-vision-pro-32k-250115',
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
            logger.error('API chat error:', error);
            throw new Error(`Failed to connect to AI service: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async apiChatStream(prompt: string, history: ChatMessage[] = [], onChunk: (chunk: string) => void): Promise<string> {
        try {
            logger.info('=== API Stream Chat Debug Info ===');
            logger.info('apiEndpoint:', this.apiEndpoint);
            logger.info('apiKey:', this.apiKey ? this.apiKey.substring(0, 8) + '...' : 'not set');

            const messages: ChatMessage[] = [
                {
                    role: 'system',
                    content: promptManager.getSystemPrompt()
                },
                ...history.slice(-10), // Keep last 10 messages for context
                {
                    role: 'user',
                    content: prompt
                }
            ];

            logger.info('Sending streaming request to:', this.apiEndpoint);
            const response = await axios.post(this.apiEndpoint, {
                model: 'doubao-1-5-vision-pro-32k-250115',
                messages: messages,
                max_tokens: 1000,
                temperature: 0.7,
                stream: true
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000,
                responseType: 'stream'
            });

            let fullContent = '';

            return new Promise((resolve, reject) => {
                response.data.on('data', (chunk: Buffer) => {
                    const lines = chunk.toString().split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') {
                                resolve(fullContent);
                                return;
                            }
                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content;
                                if (content) {
                                    fullContent += content;
                                    onChunk(content);
                                }
                            } catch (e) {
                                // Ignore parsing errors for incomplete chunks
                            }
                        }
                    }
                });

                response.data.on('end', () => {
                    resolve(fullContent);
                });

                response.data.on('error', (error: any) => {
                    reject(error);
                });
            });
        } catch (error) {
            logger.error('API stream chat error:', error);
            throw new Error(`Failed to connect to AI service: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
            throw new Error(`Failed to connect to AI service: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }


}
