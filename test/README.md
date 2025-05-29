# BCoder 测试套件

## 📁 测试结构

```
test/
├── README.md                 # 测试说明文档
├── setup/                    # 测试环境设置
│   ├── mockVSCode.ts        # VSCode API 模拟
│   ├── testUtils.ts         # 测试工具函数
│   └── testData.ts          # 测试数据
├── tools/                    # 工具系统测试
│   ├── unit/                # 单元测试
│   │   ├── fileTools.test.ts
│   │   ├── directoryTools.test.ts
│   │   ├── searchTools.test.ts
│   │   ├── securityManager.test.ts
│   │   └── toolManager.test.ts
│   ├── integration/         # 集成测试
│   │   ├── toolSystem.test.ts
│   │   └── toolWorkflow.test.ts
│   └── manual/              # 手动测试
│       ├── toolDemo.ts
│       └── interactiveTest.ts
├── agent/                   # Agent 系统测试
│   ├── unit/               # 单元测试
│   │   ├── contextManager.test.ts
│   │   ├── taskPlanner.test.ts
│   │   ├── stepExecutor.test.ts
│   │   ├── reflectionEngine.test.ts
│   │   └── agentLoop.test.ts
│   ├── integration/        # 集成测试
│   │   ├── agentSystem.test.ts
│   │   └── agentWorkflow.test.ts
│   └── scenarios/          # 场景测试
│       ├── bugFixScenario.ts
│       ├── featureImplementationScenario.ts
│       └── refactoringScenario.ts
├── e2e/                    # 端到端测试
│   ├── chatProvider.test.ts
│   ├── extension.test.ts
│   └── userWorkflow.test.ts
└── performance/            # 性能测试
    ├── toolPerformance.test.ts
    ├── agentPerformance.test.ts
    └── memoryUsage.test.ts
```

## 🚀 快速开始

### 运行所有测试
```bash
npm test
```

### 运行特定测试类别
```bash
# 工具系统测试
npm run test:tools

# Agent 系统测试  
npm run test:agent

# 端到端测试
npm run test:e2e

# 性能测试
npm run test:performance
```

### 手动测试
```bash
# 工具系统演示
npm run demo:tools

# Agent 工作流演示
npm run demo:agent
```

## 📋 测试清单

### ✅ 工具系统测试
- [ ] 文件操作工具
- [ ] 目录操作工具
- [ ] 搜索工具
- [ ] 安全管理器
- [ ] 工具管理器
- [ ] 工具系统集成

### ✅ Agent 系统测试
- [ ] 上下文管理器
- [ ] 任务规划器
- [ ] 步骤执行器
- [ ] 反思引擎
- [ ] Agent 循环
- [ ] Agent 系统集成

### ✅ 场景测试
- [ ] Bug 修复场景
- [ ] 功能实现场景
- [ ] 代码重构场景
- [ ] 文档生成场景

### ✅ 性能测试
- [ ] 工具执行性能
- [ ] Agent 决策性能
- [ ] 内存使用情况
- [ ] 并发处理能力

## 🛠️ 测试工具

- **Jest**: 单元测试框架
- **Sinon**: 模拟和存根
- **VSCode Test**: VSCode 扩展测试
- **Benchmark.js**: 性能测试

## 📊 测试报告

测试完成后会生成：
- 覆盖率报告
- 性能基准报告
- 测试结果摘要
- 错误分析报告
