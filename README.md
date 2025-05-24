# BCoder - AI Code Assistant

BCoder 是一个智能的 VSCode 代码助手插件，提供代码补全和问答功能，帮助开发者提高编程效率。

## 功能特性

### 🚀 智能代码补全
- 基于上下文的智能代码补全
- 支持多种编程语言（JavaScript, TypeScript, Python, Java, C#, Go 等）
- AI 驱动的代码建议
- 自定义补全延迟和长度

### 💬 代码问答助手
- 自然语言代码问答
- 代码解释和分析
- 代码生成和优化建议
- 错误诊断和修复建议

### 🎨 用户界面
- 集成的聊天面板
- 右键菜单快捷操作
- 键盘快捷键支持
- 可配置的设置选项

## 安装

### 从源码安装

1. 克隆仓库：
```bash
git clone https://github.com/your-username/BCoder.git
cd BCoder
```

2. 安装依赖：
```bash
npm install
```

3. 编译项目：
```bash
npm run compile
```

4. 打包插件：
```bash
npm run package
```

5. 在 VSCode 中安装生成的 `.vsix` 文件

### 从 VSCode 市场安装
（待发布到 VSCode 市场后可用）

## 使用方法

### 代码补全
1. 在支持的文件中开始输入代码
2. BCoder 会自动提供智能补全建议
3. 使用 `Tab` 或 `Enter` 接受建议

### 问答功能
1. 使用命令面板 (`Ctrl+Shift+P`) 搜索 "BCoder"
2. 选择 "Ask BCoder" 或使用快捷键 `Ctrl+Shift+Q`
3. 输入您的问题并获得 AI 回答

### 代码解释
1. 选择要解释的代码
2. 右键选择 "Explain Code" 或使用快捷键 `Ctrl+Shift+E`
3. 查看详细的代码解释

### 代码生成
1. 使用命令 "Generate Code"
2. 描述您想要生成的代码
3. BCoder 会在当前位置插入生成的代码

## 配置选项

在 VSCode 设置中搜索 "BCoder" 来配置以下选项：

- `bcoder.enabled`: 启用/禁用 BCoder 助手
- `bcoder.autoCompletion`: 启用/禁用自动代码补全
- `bcoder.apiEndpoint`: AI 服务的 API 端点（可选）
- `bcoder.apiKey`: AI 服务的 API 密钥（可选）
- `bcoder.maxCompletionLength`: 代码补全建议的最大长度
- `bcoder.completionDelay`: 显示补全建议前的延迟时间

## 命令列表

| 命令 | 快捷键 | 描述 |
|------|--------|------|
| `bcoder.askQuestion` | `Ctrl+Shift+Q` | 向 BCoder 提问 |
| `bcoder.explainCode` | `Ctrl+Shift+E` | 解释选中的代码 |
| `bcoder.generateCode` | - | 生成代码 |
| `bcoder.toggleCompletion` | - | 切换自动补全功能 |

## 支持的语言

- JavaScript / TypeScript
- Python
- Java
- C#
- C/C++
- Go
- Rust
- PHP
- Ruby
- 以及更多...

## 开发

### 环境要求
- Node.js 16+
- VSCode 1.74.0+

### 开发设置
1. 克隆仓库并安装依赖
2. 在 VSCode 中打开项目
3. 按 `F5` 启动扩展开发主机
4. 在新窗口中测试插件功能

### 运行测试
```bash
npm test
```

### 代码检查
```bash
npm run lint
```

## 架构

```
src/
├── extension.ts          # 插件主入口
├── completionProvider.ts # 代码补全提供者
├── chatProvider.ts       # 问答功能提供者
└── utils/
    ├── aiClient.ts       # AI 客户端
    └── parser.ts         # 代码解析工具
```

## 贡献

欢迎贡献代码！请遵循以下步骤：

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 更新日志

### v0.1.0
- 初始版本发布
- 基本代码补全功能
- 问答助手功能
- 多语言支持

## 支持

如果您遇到问题或有建议，请：
- 提交 [Issue](https://github.com/your-username/BCoder/issues)
- 发送邮件至 support@bcoder.dev
- 查看 [文档](https://bcoder.dev/docs)

## 致谢

感谢所有为这个项目做出贡献的开发者和用户！
