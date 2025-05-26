# 技术架构设计

## 🏗️ 整体架构

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    BCoder VSCode Extension                  │
├─────────────────────────────────────────────────────────────┤
│  UI Layer                                                   │
│  ├── Chat Interface (Webview)                              │
│  ├── Settings Panel                                        │
│  └── Status Indicators                                     │
├─────────────────────────────────────────────────────────────┤
│  Agent Layer                                               │
│  ├── Task Planner                                          │
│  ├── Tool Orchestrator                                     │
│  └── Context Manager                                       │
├─────────────────────────────────────────────────────────────┤
│  Tool Layer                                                │
│  ├── File Operations    ├── Code Analysis                  │
│  ├── Terminal Control   ├── Git Integration                │
│  └── VSCode Integration └── Web Search                     │
├─────────────────────────────────────────────────────────────┤
│  Retrieval Layer                                           │
│  ├── Hybrid Search Engine                                  │
│  ├── AST Parser                                            │
│  └── Semantic Indexer                                      │
├─────────────────────────────────────────────────────────────┤
│  External Integrations                                     │
│  ├── MCP Servers        ├── Language Servers               │
│  ├── LLM APIs          └── Local Models                    │
└─────────────────────────────────────────────────────────────┘
```

## 🧠 Agent 工作流程

### 核心 Agent Loop

基于对 Cline 和 Augment SWE-bench Agent 的分析，设计如下工作流程：

```typescript
class BCoderAgent {
  async processTask(userInput: string): Promise<void> {
    while (!this.isTaskComplete()) {
      // 1. 观察 (Observe)
      const context = await this.observe();
      
      // 2. 计划 (Plan) 
      const plan = await this.plan(context, userInput);
      
      // 3. 执行 (Act)
      const results = await this.act(plan);
      
      // 4. 反思 (Reflect)
      const reflection = await this.reflect(results);
      
      if (reflection.shouldContinue) {
        this.updateContext(reflection);
      } else {
        break;
      }
    }
  }
}
```

### 工作流程详解

#### Phase 1: 观察 (Observe)
```typescript
async observe(): Promise<Context> {
  return {
    // 当前工作区状态
    workspace: await this.scanWorkspace(),
    
    // 活动文件信息
    activeFile: await this.getActiveFileInfo(),
    
    // Git 状态
    gitStatus: await this.getGitStatus(),
    
    // 终端状态
    terminalState: await this.getTerminalState(),
    
    // 错误和问题
    diagnostics: await this.getDiagnostics()
  };
}
```

#### Phase 2: 计划 (Plan)
```typescript
async plan(context: Context, task: string): Promise<Plan> {
  // 1. 任务分解
  const subtasks = await this.decomposeTask(task);
  
  // 2. 工具选择
  const tools = await this.selectTools(subtasks);
  
  // 3. 执行顺序
  const sequence = await this.planSequence(subtasks, tools);
  
  return { subtasks, tools, sequence };
}
```

#### Phase 3: 执行 (Act)
```typescript
async act(plan: Plan): Promise<ActionResult[]> {
  const results = [];
  
  for (const step of plan.sequence) {
    try {
      const result = await this.executeStep(step);
      results.push(result);
      
      // 实时反馈
      await this.provideFeedback(step, result);
      
    } catch (error) {
      await this.handleError(error, step);
    }
  }
  
  return results;
}
```

## 🔍 混合检索系统

### 多层次检索架构

基于对现有工具检索能力的分析，设计三层检索系统：

```typescript
class HybridRetrievalEngine {
  // 第一层：快速文本搜索
  async textSearch(query: string): Promise<TextResult[]> {
    return await this.ripgrepSearch(query);
  }
  
  // 第二层：AST 结构搜索  
  async astSearch(query: string): Promise<ASTResult[]> {
    return await this.treeSitterSearch(query);
  }
  
  // 第三层：语义向量搜索
  async semanticSearch(query: string): Promise<SemanticResult[]> {
    return await this.embeddingSearch(query);
  }
  
  // 融合排序
  async hybridSearch(query: string): Promise<SearchResult[]> {
    const [textResults, astResults, semanticResults] = await Promise.all([
      this.textSearch(query),
      this.astSearch(query), 
      this.semanticSearch(query)
    ]);
    
    return this.fusionRanking([textResults, astResults, semanticResults]);
  }
}
```

### 检索策略对比

| 检索方法 | 速度 | 准确性 | 适用场景 | BCoder 使用 |
|---------|------|--------|---------|------------|
| **文本搜索** | ⚡⚡⚡ | ⭐⭐ | 关键词查找 | 第一层过滤 |
| **AST 搜索** | ⚡⚡ | ⭐⭐⭐⭐ | 语法结构 | 精确匹配 |
| **语义搜索** | ⚡ | ⭐⭐⭐⭐⭐ | 概念理解 | 智能关联 |

## 🛠️ 工具系统设计

### 核心工具集

基于对 Cline 和 MCP 标准的分析，设计如下工具体系：

#### 文件操作工具
```typescript
interface FileTools {
  read_file(path: string): Promise<string>;
  write_file(path: string, content: string): Promise<void>;
  edit_file(path: string, changes: EditChange[]): Promise<void>;
  list_files(directory: string): Promise<FileInfo[]>;
  search_files(pattern: string): Promise<SearchResult[]>;
}
```

#### 代码分析工具
```typescript
interface CodeAnalysisTools {
  parse_ast(file: string): Promise<ASTNode>;
  find_definitions(symbol: string): Promise<Definition[]>;
  find_references(symbol: string): Promise<Reference[]>;
  get_diagnostics(file: string): Promise<Diagnostic[]>;
}
```

#### 终端控制工具
```typescript
interface TerminalTools {
  execute_command(command: string): Promise<CommandResult>;
  start_process(command: string): Promise<ProcessHandle>;
  get_process_output(handle: ProcessHandle): Promise<string>;
  kill_process(handle: ProcessHandle): Promise<void>;
}
```

#### VSCode 集成工具
```typescript
interface VSCodeTools {
  open_file(path: string): Promise<void>;
  show_diff(original: string, modified: string): Promise<void>;
  insert_text(position: Position, text: string): Promise<void>;
  show_notification(message: string): Promise<void>;
}
```

### 工具选择策略

```typescript
class ToolSelector {
  selectTools(task: TaskType): Tool[] {
    switch (task) {
      case 'bug_fix':
        return ['read_file', 'search_files', 'edit_file', 'execute_command'];
      case 'feature_implementation':
        return ['list_files', 'read_file', 'write_file', 'execute_command'];
      case 'code_review':
        return ['read_file', 'get_diagnostics', 'find_references'];
      case 'refactoring':
        return ['parse_ast', 'find_references', 'edit_file'];
    }
  }
}
```

## 🔗 MCP 集成架构

### MCP 服务器集成

基于调研的 MCP 标准服务器，设计如下集成方案：

```typescript
class MCPIntegration {
  private servers = new Map<string, MCPServer>();
  
  async initializeServers() {
    // 文件系统服务器
    this.servers.set('filesystem', new MCPServer({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', this.workspaceRoot]
    }));
    
    // Git 服务器
    this.servers.set('git', new MCPServer({
      command: 'npx', 
      args: ['-y', '@modelcontextprotocol/server-git']
    }));
    
    // 搜索服务器
    this.servers.set('search', new MCPServer({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search']
    }));
  }
  
  async callTool(serverName: string, toolName: string, args: any) {
    const server = this.servers.get(serverName);
    return await server.callTool(toolName, args);
  }
}
```

### 本地 vs MCP 工具策略

```typescript
class ToolRouter {
  async routeToolCall(toolName: string, args: any) {
    // 检测环境
    if (this.isRemoteEnvironment()) {
      // SSH Remote: 使用 VSCode API
      return await this.vscodeTools[toolName](args);
    } else {
      // 本地环境: 优先使用 MCP
      return await this.mcpTools[toolName](args);
    }
  }
  
  private isRemoteEnvironment(): boolean {
    return vscode.env.remoteName !== undefined;
  }
}
```

## 🎯 性能优化策略

### 上下文管理

```typescript
class ContextManager {
  private maxTokens = 100000;
  
  async optimizeContext(files: FileInfo[]): Promise<OptimizedContext> {
    // 1. 重要性评分
    const scored = files.map(file => ({
      ...file,
      importance: this.calculateImportance(file),
      tokens: this.estimateTokens(file)
    }));
    
    // 2. 贪心选择
    const selected = this.greedySelection(scored, this.maxTokens);
    
    // 3. 内容压缩
    const compressed = await this.compressContent(selected);
    
    return compressed;
  }
}
```

### 增量索引

```typescript
class IncrementalIndexer {
  async onFileChange(filePath: string) {
    // 1. 解析变更文件
    const ast = await this.parseAST(filePath);
    
    // 2. 更新索引
    await this.updateIndex(filePath, ast);
    
    // 3. 更新依赖关系
    await this.updateDependencies(filePath);
  }
}
```

## 🔒 安全架构

### 权限控制

```typescript
class SecurityManager {
  async validateOperation(operation: Operation): Promise<boolean> {
    // 1. 路径验证
    if (!this.isPathSafe(operation.path)) {
      return false;
    }
    
    // 2. 命令白名单
    if (!this.isCommandSafe(operation.command)) {
      return false;
    }
    
    // 3. 用户确认
    if (operation.requiresConfirmation) {
      return await this.requestUserConfirmation(operation);
    }
    
    return true;
  }
}
```

### 沙箱执行

```typescript
class SandboxExecutor {
  async executeCommand(command: string): Promise<CommandResult> {
    // 1. 命令验证
    await this.validateCommand(command);
    
    // 2. 沙箱环境
    const sandbox = await this.createSandbox();
    
    // 3. 执行监控
    return await this.monitoredExecution(sandbox, command);
  }
}
```

---

*下一步: 查看 [产品功能需求](./03-product-requirements.md)*
