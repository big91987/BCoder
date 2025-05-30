# Agent Backup Files

这个文件夹包含了旧的 Agent 架构实现文件，这些文件在新架构重构后不再使用，但保留作为参考。

## 🗂️ 文件说明

### 旧架构文件：
- **`agentLoop.ts`** - 旧的 Agent 主循环实现，基于 OPAR 模式
- **`contextManager.ts`** - 上下文管理器，负责收集工作区信息
- **`taskPlanner.ts`** - 任务规划器，负责分析用户请求并生成执行计划
- **`stepExecutor.ts`** - 步骤执行器，负责执行具体的工具调用
- **`reflectionEngine.ts`** - 反思引擎，负责分析执行结果并学习
- **`types.ts`** - 旧的类型定义

## 🔄 架构变更

### 旧架构（已废弃）：
```
ChatProvider → AgentSystem → AgentLoop → [ContextManager, TaskPlanner, StepExecutor, ReflectionEngine]
```

### 新架构（当前使用）：
```
ChatProvider → AgentManager → IAgent → AgentSystem（向后兼容包装器）
```

## ✨ 新架构优势

1. **标准化接口**：所有 Agent 都实现 `IAgent` 接口
2. **可插拔设计**：支持多种 Agent 类型
3. **纯桥接模式**：ChatProvider 只做桥接，不做路由
4. **Agent 自主性**：Agent 完全控制自己的执行流程和消息格式
5. **易于扩展**：可以轻松添加新的 Agent 实现

## 📝 注意事项

- 这些文件仅作为参考保留，不应在新代码中使用
- 如需了解旧架构的实现细节，可以查看这些文件
- 新功能开发应基于新的 `IAgent` 接口

## 🗑️ 清理计划

这些文件可能在未来版本中被完全删除，建议：
- 不要在新代码中引用这些文件
- 如有需要，将相关逻辑迁移到新架构中
- 定期评估是否还需要保留这些文件
