# 🧪 BCoder 测试指南

## 📋 测试概述

BCoder 项目包含完整的测试套件，涵盖工具系统和 Agent 工作流的各个方面。测试分为单元测试、集成测试和手动演示。

## 📁 测试结构

```
test/
├── setup/                    # 测试环境设置
│   ├── mockVSCode.ts        # VSCode API 模拟
│   ├── testUtils.ts         # 测试工具函数
│   └── testData.ts          # 测试数据
├── tools/                   # 🛠️ 工具系统测试
│   ├── unit/               # 单元测试
│   │   ├── fileTools.test.ts
│   │   ├── securityManager.test.ts
│   │   └── ...
│   ├── integration/        # 集成测试
│   │   └── toolSystem.test.ts
│   └── manual/             # 手动演示
│       └── toolDemo.ts
├── agent/                  # 🤖 Agent 系统测试
│   ├── unit/              # 单元测试
│   │   ├── contextManager.test.ts
│   │   └── ...
│   ├── integration/       # 集成测试
│   │   └── agentSystem.test.ts
│   └── scenarios/         # 场景测试
└── runAllTests.ts         # 主测试运行器
```

## 🚀 快速开始

### 运行所有测试
```bash
npm run test:all
```

### 按类别运行测试

#### 工具系统测试
```bash
npm run test:tools
```

#### Agent 系统测试
```bash
npm run test:agent
```

#### 集成测试
```bash
npm run test:integration
```

#### 单元测试
```bash
npm run test:unit
```

### 运行演示
```bash
npm run demo:tools
```

## 📊 测试类别详解

### 🛠️ 工具系统测试

#### 单元测试
- **fileTools.test.ts** - 文件操作工具测试
  - 文件读取、写入、编辑
  - 路径安全验证
  - 错误处理

- **securityManager.test.ts** - 安全管理器测试
  - 路径验证
  - 权限检查
  - 安全配置

#### 集成测试
- **toolSystem.test.ts** - 工具系统集成测试
  - 工具注册和管理
  - 批量工具执行
  - 完整工作流测试

#### 手动演示
- **toolDemo.ts** - 交互式工具演示
  - 展示所有工具功能
  - 实际文件操作演示
  - 性能和稳定性验证

### 🤖 Agent 系统测试

#### 单元测试
- **contextManager.test.ts** - 上下文管理器测试
  - 上下文收集
  - 项目结构分析
  - 缓存机制

#### 集成测试
- **agentSystem.test.ts** - Agent 系统集成测试
  - OPAR 循环测试
  - 任务处理流程
  - 事件系统验证

## 🔧 测试环境

### 模拟环境
测试使用完全模拟的 VSCode 环境，包括：
- VSCode API 模拟
- 文件系统操作
- AI 客户端模拟
- 日志系统模拟

### 临时文件系统
- 每个测试都在独立的临时目录中运行
- 自动创建测试项目结构
- 测试完成后自动清理

### 安全隔离
- 所有文件操作限制在测试目录内
- 防止测试影响真实文件系统
- 完整的路径安全验证

## 📈 测试报告

### 运行结果示例
```
🧪 BCoder 测试套件
============================================================
📋 总共 5 个测试套件

🔍 运行: 文件工具单元测试
----------------------------------------
✅ ReadFileTool - 成功读取文件
✅ ReadFileTool - 文件不存在
✅ ReadFileTool - 路径安全检查
✅ WriteFileTool - 成功写入文件
✅ WriteFileTool - 创建子目录
✅ EditFileTool - 成功编辑文件
✅ EditFileTool - 文本未找到
✅ GetFileInfoTool - 获取文件信息
✅ GetFileInfoTool - 获取目录信息

🎯 File Tools Tests Complete: 9 passed, 0 failed

============================================================
📊 测试结果总结
============================================================

🛠️ 工具系统:
  ✅ 文件工具单元测试: 9 通过, 0 失败
  ✅ 安全管理器单元测试: 12 通过, 0 失败
  ✅ 工具系统集成测试: 8 通过, 0 失败

🤖 Agent 系统:
  ✅ 上下文管理器单元测试: 10 通过, 0 失败

🔗 集成测试:
  ✅ Agent 系统集成测试: 9 通过, 0 失败

📈 总体统计:
  测试套件: 5/5 通过
  测试用例: 48 通过, 0 失败
  成功率: 100.0%

============================================================
🎉 所有测试通过! BCoder 系统运行正常
============================================================
```

## 🛠️ 开发测试

### 添加新测试
1. 在相应目录创建测试文件
2. 导入测试框架和工具
3. 编写测试用例
4. 在 `runAllTests.ts` 中注册

### 测试最佳实践
1. **独立性**: 每个测试应该独立运行
2. **清理**: 使用 beforeEach/afterEach 清理环境
3. **断言**: 使用明确的断言和错误消息
4. **覆盖**: 测试正常和异常情况
5. **性能**: 避免长时间运行的测试

### 调试测试
```bash
# 编译并运行特定测试
npm run compile
node out/test/tools/unit/fileTools.test.js

# 查看详细输出
DEBUG=* npm run test:tools
```

## 🎯 测试覆盖范围

### ✅ 已覆盖功能
- [x] 文件操作工具 (10个工具)
- [x] 安全管理系统
- [x] 工具管理器
- [x] 上下文管理器
- [x] Agent 系统集成
- [x] 错误处理
- [x] 权限验证

### 🔄 待扩展测试
- [ ] 任务规划器单元测试
- [ ] 步骤执行器单元测试
- [ ] 反思引擎单元测试
- [ ] 性能基准测试
- [ ] 并发处理测试
- [ ] 内存使用测试

## 🚨 故障排除

### 常见问题

#### 1. 编译错误
```bash
# 清理并重新编译
rm -rf out/
npm run compile
```

#### 2. 路径问题
- 确保在项目根目录运行测试
- 检查相对路径是否正确

#### 3. 权限问题
- 确保有临时目录写入权限
- 检查测试目录清理是否正常

#### 4. 模拟环境问题
- 检查 VSCode API 模拟是否完整
- 验证依赖模块是否正确导入

### 获取帮助
1. 查看测试日志输出
2. 检查错误堆栈信息
3. 验证测试环境设置
4. 参考现有测试用例

## 📚 相关文档
- [TOOL_DEMO.md](TOOL_DEMO.md) - 工具系统演示
- [AGENT_WORKFLOW_DEMO.md](AGENT_WORKFLOW_DEMO.md) - Agent 工作流演示
- [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md) - 实现总结

---

**🎉 通过完整的测试套件，确保 BCoder 系统的稳定性和可靠性！**
