/**
 * 标准化消息格式和流式解析器使用示例
 * 展示如何使用新的消息格式构建Agent
 */

import { StandardMessage, MessageFactory, MessageType } from '../types/message';
import { StreamingParser } from '../components/StreamingParser';
import { BaseAgent, AgentCallbacks } from '../components/BaseAgent';

/**
 * 示例：简单的文件操作Agent
 * 展示如何使用标准化消息格式
 */
export class ExampleAgent extends BaseAgent {
    constructor() {
        super('ExampleAgent');
    }

    async processMessage(message: string, callbacks: AgentCallbacks): Promise<string> {
        // 模拟LLM流式响应
        const mockLLMResponse = `THOUGHT: 用户想要操作文件，我需要分析具体需求。
ACTION: read_file
ACTION_INPUT: {"path": "example.txt"}`;

        // 使用流式解析器处理响应
        return this.executeReActLoop(message, callbacks, this.mockLLMCall.bind(this, mockLLMResponse));
    }

    private async *mockLLMCall(response: string, messages: any[]): AsyncIterable<string> {
        // 模拟流式输出
        for (const char of response) {
            yield char;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    protected async executeTool(
        toolName: string, 
        toolInput: any, 
        callbacks: AgentCallbacks
    ): Promise<{ success: boolean; data?: any; error?: string }> {
        // 发送工具开始消息
        this.sendToolStartMessage(toolName, toolInput, callbacks);

        // 模拟工具执行
        await new Promise(resolve => setTimeout(resolve, 1000));

        const result = {
            success: true,
            data: { content: 'Hello World!', size: 12 }
        };

        // 发送工具结束消息
        this.sendToolEndMessage(toolName, toolInput, result, callbacks);
        
        return result;
    }
}

/**
 * 使用示例函数
 */
export function demonstrateStandardMessages() {
    console.log('=== 标准化消息格式示例 ===');

    // 1. 创建用户消息
    const userMsg = MessageFactory.userMessage('请读取 package.json 文件');
    console.log('用户消息:', userMsg);

    // 2. 创建思考消息（流式）
    const thinkStart = MessageFactory.thinkMessage('', 'start', 'BCoder');
    const thinkDelta = MessageFactory.thinkMessage('用户想要读取文件...', 'delta', 'BCoder');
    const thinkEnd = MessageFactory.thinkMessage('用户想要读取文件，我需要使用read_file工具', 'end', 'BCoder');
    
    console.log('思考开始:', thinkStart);
    console.log('思考增量:', thinkDelta);
    console.log('思考结束:', thinkEnd);

    // 3. 创建工具消息
    const toolStart = MessageFactory.toolMessage(
        '正在读取文件: package.json', 
        'start', 
        'BCoder',
        'read_file'
    );
    const toolEnd = MessageFactory.toolMessage(
        '文件读取完成', 
        'end', 
        'BCoder',
        'read_file', 
        true, 
        { content: '{"name": "bcoder"}' }
    );
    
    console.log('工具开始:', toolStart);
    console.log('工具结束:', toolEnd);

    // 4. 创建文本回复消息（流式）
    const textStart = MessageFactory.textMessage('', 'start', 'BCoder');
    const textDelta = MessageFactory.textMessage('文件内容是...', 'delta', 'BCoder');
    const textEnd = MessageFactory.textMessage('文件内容是: {"name": "bcoder"}', 'end', 'BCoder');
    
    console.log('回复开始:', textStart);
    console.log('回复增量:', textDelta);
    console.log('回复结束:', textEnd);

    // 5. 创建错误消息
    const errorMsg = MessageFactory.errorMessage('文件不存在', 'BCoder', 'ENOENT');
    console.log('错误消息:', errorMsg);
}

/**
 * 流式解析器使用示例
 */
export function demonstrateStreamingParser() {
    console.log('=== 流式解析器示例 ===');

    const parser = new StreamingParser();
    const messages: StandardMessage[] = [];

    // 模拟消息回调
    const onMessage = (message: StandardMessage) => {
        messages.push(message);
        console.log(`收到消息: [${message.role}] ${message.type} (${message.status}) - ${message.content}`);
    };

    // 模拟流式LLM响应
    const chunks = [
        'THOUGHT: 用户想要',
        '读取文件\nACTION: read_file\nACTION_INPUT: {"path"',
        ': "test.txt"}\nFINAL_ANSWER: 文件内容',
        '已读取完成。'
    ];

    console.log('开始处理流式内容...');
    
    let fullContent = '';
    chunks.forEach((chunk, index) => {
        fullContent += chunk;
        console.log(`\n--- 处理块 ${index + 1} ---`);
        console.log(`累积内容: "${fullContent}"`);
        
        parser.processStreamingContent(fullContent, 'BCoder', onMessage);
    });

    // 完成流式处理
    parser.completeCurrentStream(onMessage);

    console.log('\n=== 最终消息列表 ===');
    messages.forEach((msg, index) => {
        console.log(`${index + 1}. [${msg.role}] ${msg.type} (${msg.status}): ${msg.content}`);
    });
}

/**
 * Multi-Agent 示例
 */
export function demonstrateMultiAgent() {
    console.log('=== Multi-Agent 消息示例 ===');

    // 不同角色的消息
    const roles = ['BCoder', 'CodeReviewer', 'Architect', 'Tester'];
    
    roles.forEach(role => {
        const msg = MessageFactory.textMessage(`我是 ${role}，负责相应的工作`, 'end', role);
        console.log(`${role} 消息:`, msg);
    });

    // 协作场景
    const collaboration = [
        MessageFactory.textMessage('请帮我实现一个登录功能', 'end', 'user'),
        MessageFactory.thinkMessage('需要设计登录系统的架构', 'end', 'Architect'),
        MessageFactory.textMessage('我来实现具体的代码', 'end', 'BCoder'),
        MessageFactory.textMessage('我来审查代码质量', 'end', 'CodeReviewer'),
        MessageFactory.textMessage('我来编写测试用例', 'end', 'Tester')
    ];

    console.log('\n协作流程:');
    collaboration.forEach((msg, index) => {
        console.log(`${index + 1}. [${msg.role}]: ${msg.content}`);
    });
}

// 如果直接运行此文件，执行示例
if (require.main === module) {
    demonstrateStandardMessages();
    console.log('\n');
    demonstrateStreamingParser();
    console.log('\n');
    demonstrateMultiAgent();
}
