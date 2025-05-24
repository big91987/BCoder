# BCoder 使用指南

## 安装插件

### 方法一：从 .vsix 文件安装
1. 打开 VSCode
2. 按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (Mac) 打开命令面板
3. 输入 "Extensions: Install from VSIX..."
4. 选择项目根目录下的 `bcoder-0.1.0.vsix` 文件
5. 重启 VSCode

### 方法二：开发模式运行
1. 在 VSCode 中打开项目文件夹
2. 按 `F5` 启动扩展开发主机
3. 在新打开的 VSCode 窗口中测试插件功能

## 功能使用

### 1. 代码补全
- 在支持的文件中开始输入代码
- BCoder 会自动显示智能补全建议
- 使用 `Tab` 或 `Enter` 接受建议
- 支持的语言：JavaScript, TypeScript, Python, Java, C#, Go 等

### 2. 问答功能
#### 通过命令面板
1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 "BCoder: Ask BCoder" 或使用快捷键 `Ctrl+Shift+Q`
3. 在弹出的输入框中输入问题
4. 查看 AI 回答

#### 通过聊天面板
1. 在左侧活动栏点击 BCoder 图标
2. 在聊天面板中输入问题
3. 实时获得 AI 回答

### 3. 代码解释
1. 选择要解释的代码片段
2. 右键选择 "Explain Code" 或使用快捷键 `Ctrl+Shift+E`
3. 查看详细的代码解释文档

### 4. 代码生成
1. 将光标放在要插入代码的位置
2. 使用命令 "BCoder: Generate Code"
3. 描述您想要生成的代码
4. BCoder 会在当前位置插入生成的代码

## 配置选项

在 VSCode 设置中搜索 "BCoder" 来配置以下选项：

### 基本设置
- **bcoder.enabled**: 启用/禁用 BCoder 助手
- **bcoder.autoCompletion**: 启用/禁用自动代码补全

### AI 服务设置（可选）
- **bcoder.apiEndpoint**: AI 服务的 API 端点
- **bcoder.apiKey**: AI 服务的 API 密钥

### 性能设置
- **bcoder.maxCompletionLength**: 代码补全建议的最大长度（默认：100）
- **bcoder.completionDelay**: 显示补全建议前的延迟时间（默认：500ms）

## 快捷键

| 功能 | Windows/Linux | Mac |
|------|---------------|-----|
| 提问 | `Ctrl+Shift+Q` | `Cmd+Shift+Q` |
| 解释代码 | `Ctrl+Shift+E` | `Cmd+Shift+E` |

## 工作模式

### 本地模式（默认）
- 无需配置 API
- 使用内置的规则和模式匹配
- 提供基本的代码补全和问答功能

### API 模式
- 需要配置 API 端点和密钥
- 提供更强大的 AI 功能
- 支持更复杂的代码分析和生成

## 故障排除

### 插件无法激活
1. 检查 VSCode 版本是否为 1.74.0 或更高
2. 重启 VSCode
3. 查看输出面板中的错误信息

### 代码补全不工作
1. 检查 `bcoder.autoCompletion` 设置是否启用
2. 确认当前文件类型受支持
3. 尝试手动触发补全（`Ctrl+Space`）

### API 模式连接失败
1. 检查网络连接
2. 验证 API 端点和密钥配置
3. 查看开发者工具中的网络请求

## 支持的文件类型

- JavaScript (.js)
- TypeScript (.ts)
- Python (.py)
- Java (.java)
- C# (.cs)
- C/C++ (.c, .cpp, .h)
- Go (.go)
- Rust (.rs)
- PHP (.php)
- Ruby (.rb)
- 以及更多...

## 反馈和支持

如果您遇到问题或有建议，请：
1. 查看项目的 GitHub Issues
2. 提交新的 Issue 描述问题
3. 参与项目讨论和改进

## 更新日志

### v0.1.0 (当前版本)
- 初始版本发布
- 基本代码补全功能
- 问答助手功能
- 多语言支持
- 本地和 API 两种工作模式
