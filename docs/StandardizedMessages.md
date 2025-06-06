# 标准化消息格式和流式解析器

## 🎯 概述

BCoder 现在支持标准化的消息格式，提供了统一的消息处理和流式解析能力。这个设计支持 multi-agent 场景，并且可以轻松扩展。

## 📋 消息格式

### 标准化消息接口

```typescript
interface StandardMessage {
    /** 消息角色（开放字符串，支持multi-agent） */
    role: string;
    
    /** 消息类型 */
    type: string;
    
    /** 消息内容 */
    content: string;
    
    /** 消息状态（用于流式处理） */
    status: MessageStatus;
    
    /** 元数据（可选） */
    metadata?: any;
    
    /** 时间戳 */
    timestamp?: Date;
    
    /** 消息ID（可选，用于追踪） */
    id?: string;
}
```

### 消息状态

```typescript
type MessageStatus = 'start' | 'delta' | 'end';
```

- **start**: 开始流式消息
- **delta**: 流式消息片段
- **end**: 结束流式消息

### 消息类型

```typescript
enum MessageType {
    /** 思考过程 - 可收起的思考框 */
    THINK = 'think',
    
    /** 工具执行 - 工具调用和结果 */
    TOOL = 'tool',
    
    /** 文本回复 - 普通对话内容 */
    TEXT = 'text',
    
    /** 错误信息 */
    ERROR = 'error'
}
```

## 🏭 消息工厂

使用 `MessageFactory` 快速创建标准化消息：

```typescript
import { MessageFactory } from '../types/message';

// 用户消息
const userMsg = MessageFactory.userMessage('请读取文件');

// 思考消息（流式）
const thinkStart = MessageFactory.thinkMessage('', 'start', 'BCoder');
const thinkDelta = MessageFactory.thinkMessage('正在分析...', 'delta', 'BCoder');
const thinkEnd = MessageFactory.thinkMessage('分析完成', 'end', 'BCoder');

// 工具消息
const toolMsg = MessageFactory.toolMessage(
    '正在读取文件', 
    'start', 
    'BCoder',
    'read_file'
);

// 文本回复
const textMsg = MessageFactory.textMessage('操作完成', 'end', 'BCoder');

// 错误消息
const errorMsg = MessageFactory.errorMessage('操作失败', 'BCoder');
```

## 🌊 流式解析器

### StreamingParser 类

独立的流式解析器，可以被任何 Agent 使用：

```typescript
import { StreamingParser } from '../components/StreamingParser';

const parser = new StreamingParser();

// 处理流式内容
parser.processStreamingContent(
    chunk, 
    'BCoder', 
    (message) => {
        // 处理生成的标准化消息
        console.log(message);
    }
);

// 完成当前流
parser.completeCurrentStream(onMessage);

// 重置解析器
parser.reset();
```

### 解析 ReAct 格式

解析器支持标准的 ReAct 格式：

```
THOUGHT: 用户想要读取文件
ACTION: read_file
ACTION_INPUT: {"path": "example.txt"}
FINAL_ANSWER: 文件内容已读取
```

## 🤖 Agent 基类

### BaseAgent 类

提供标准化的 Agent 实现模板：

```typescript
import { BaseAgent, AgentCallbacks } from '../components/BaseAgent';

export class MyAgent extends BaseAgent {
    constructor() {
        super('MyAgent');
    }

    async processMessage(message: string, callbacks: AgentCallbacks): Promise<string> {
        // 实现具体的处理逻辑
        return this.executeReActLoop(message, callbacks, this.llmCall);
    }

    protected async executeTool(toolName: string, toolInput: any, callbacks: AgentCallbacks) {
        // 实现工具执行逻辑
        this.sendToolStartMessage(toolName, toolInput, callbacks);
        
        // 执行工具...
        const result = { success: true, data: {} };
        
        this.sendToolEndMessage(toolName, toolInput, result, callbacks);
        return result;
    }
}
```

## 🎨 前端渲染

前端会根据消息的 `type` 和 `status` 自动选择合适的渲染方式：

### 消息类型渲染

- **think**: 可收起的思考框
- **tool**: 工具执行框
- **text**: 普通对话气泡
- **error**: 错误消息框

### 流式渲染

- **status: 'start'**: 创建消息容器，显示光标
- **status: 'delta'**: 追加内容到容器
- **status: 'end'**: 移除光标，完成消息

## 🔄 Multi-Agent 支持

### 角色系统

`role` 字段支持任意字符串，可以表示不同的 Agent：

```typescript
// 内置角色
const roles = ['user', 'assistant', 'system'];

// 自定义 Agent 角色
const customRoles = ['BCoder', 'CodeReviewer', 'Architect', 'Tester'];

// 创建不同角色的消息
const bcoderMsg = MessageFactory.textMessage('我来写代码', 'end', 'BCoder');
const reviewerMsg = MessageFactory.textMessage('我来审查', 'end', 'CodeReviewer');
```

### 协作场景

```typescript
const collaboration = [
    MessageFactory.textMessage('需要实现登录功能', 'end', 'user'),
    MessageFactory.thinkMessage('设计系统架构', 'end', 'Architect'),
    MessageFactory.textMessage('实现具体代码', 'end', 'BCoder'),
    MessageFactory.textMessage('审查代码质量', 'end', 'CodeReviewer'),
    MessageFactory.textMessage('编写测试用例', 'end', 'Tester')
];
```

## 📦 使用示例

查看 `src/examples/standardMessageExample.ts` 获取完整的使用示例。

## 🔧 迁移指南

### 从旧格式迁移

旧格式：
```typescript
{
    role: 'assistant',
    type: 'text',
    content: 'Hello'
}
```

新格式：
```typescript
{
    role: 'BCoder',
    type: 'text',
    content: 'Hello',
    status: 'end',
    timestamp: new Date(),
    id: 'msg_123'
}
```

### 兼容性

系统同时支持新旧两种格式，可以逐步迁移。

## 🚀 扩展性

### 自定义消息类型

```typescript
// 添加新的消息类型
const customMsg = {
    role: 'DataAnalyst',
    type: 'chart',
    content: 'Chart data...',
    status: 'end',
    metadata: {
        chartType: 'bar',
        data: [1, 2, 3]
    }
};
```

### 自定义解析器

```typescript
class CustomParser extends StreamingParser {
    parseCustomFormat(content: string) {
        // 实现自定义解析逻辑
    }
}
```

## 📝 最佳实践

1. **使用 MessageFactory**: 优先使用工厂方法创建消息
2. **明确角色**: 为不同的 Agent 使用清晰的角色名称
3. **流式处理**: 对于长时间操作，使用流式消息提供实时反馈
4. **错误处理**: 使用标准化的错误消息格式
5. **元数据**: 利用 metadata 字段传递额外信息

## 🔍 调试

启用详细日志查看消息处理过程：

```typescript
import { logger } from '../utils/logger';

// 消息会自动记录到日志中
logger.debug('Message processed:', message);
```
