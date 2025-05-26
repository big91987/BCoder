# MCP 协议深度分析

## 📋 概述

Model Context Protocol (MCP) 是 Anthropic 开发的开放标准协议，用于在开发工具和语言服务器之间进行通信。本文档基于对 MCP 生态系统的深度调研。

## 🛠️ MCP 官方服务器清单

### 📁 文件系统类

| 服务器名称 | 安装命令 | 提供的工具 | 功能描述 | 优先级 |
|-----------|---------|-----------|---------|--------|
| **@modelcontextprotocol/server-filesystem** | `npx -y @modelcontextprotocol/server-filesystem "/path"` | `read_file`<br>`write_file`<br>`edit_file`<br>`list_files`<br>`search_files`<br>`create_directory`<br>`move_file`<br>`get_file_info` | 安全的文件操作，支持路径控制 | ⭐⭐⭐⭐⭐ |
| **@modelcontextprotocol/server-gdrive** | `npx -y @modelcontextprotocol/server-gdrive` | `search_files`<br>`read_file`<br>`create_file`<br>`update_file` | Google Drive 文件访问和搜索 | ⭐⭐⭐ |

### 🔧 开发工具类

| 服务器名称 | 安装命令 | 提供的工具 | 功能描述 | 优先级 |
|-----------|---------|-----------|---------|--------|
| **@modelcontextprotocol/server-git** | `npx -y @modelcontextprotocol/server-git` | `git_status`<br>`git_log`<br>`git_diff`<br>`git_add`<br>`git_commit`<br>`git_push`<br>`git_branch`<br>`search_repository` | 完整的 Git 仓库操作 | ⭐⭐⭐⭐⭐ |
| **@modelcontextprotocol/server-github** | `npx -y @modelcontextprotocol/server-github` | `create_repository`<br>`get_file_contents`<br>`create_or_update_file`<br>`create_issue`<br>`create_pull_request`<br>`list_issues`<br>`search_repositories` | GitHub API 集成 | ⭐⭐⭐⭐ |
| **@modelcontextprotocol/server-gitlab** | `npx -y @modelcontextprotocol/server-gitlab` | `get_project`<br>`list_issues`<br>`create_issue`<br>`get_merge_requests`<br>`create_merge_request` | GitLab API 集成 | ⭐⭐⭐ |

### 🗄️ 数据库类

| 服务器名称 | 安装命令 | 提供的工具 | 功能描述 | 优先级 |
|-----------|---------|-----------|---------|--------|
| **@modelcontextprotocol/server-sqlite** | `npx -y @modelcontextprotocol/server-sqlite` | `read_query`<br>`write_query`<br>`create_table`<br>`list_tables`<br>`describe_table` | SQLite 数据库操作 | ⭐⭐⭐⭐ |
| **@modelcontextprotocol/server-postgres** | `npx -y @modelcontextprotocol/server-postgres` | `read_query`<br>`list_schemas`<br>`list_tables`<br>`describe_table`<br>`get_table_schema` | PostgreSQL 只读访问 | ⭐⭐⭐ |

### 🌐 Web 和搜索类

| 服务器名称 | 安装命令 | 提供的工具 | 功能描述 | 优先级 |
|-----------|---------|-----------|---------|--------|
| **@modelcontextprotocol/server-brave-search** | `npx -y @modelcontextprotocol/server-brave-search` | `brave_web_search`<br>`brave_local_search` | Brave 搜索引擎 API | ⭐⭐⭐⭐ |
| **@modelcontextprotocol/server-fetch** | `npx -y @modelcontextprotocol/server-fetch` | `fetch_url`<br>`fetch_html`<br>`fetch_text` | 网页内容获取和转换 | ⭐⭐⭐⭐ |
| **@modelcontextprotocol/server-puppeteer** | `npx -y @modelcontextprotocol/server-puppeteer` | `screenshot`<br>`pdf_export`<br>`click_element`<br>`fill_form`<br>`navigate` | 浏览器自动化 | ⭐⭐⭐ |

### 🧠 AI 和专用工具类

| 服务器名称 | 安装命令 | 提供的工具 | 功能描述 | 优先级 |
|-----------|---------|-----------|---------|--------|
| **@modelcontextprotocol/server-memory** | `npx -y @modelcontextprotocol/server-memory` | `create_memory`<br>`search_memories`<br>`update_memory`<br>`delete_memory` | 知识图谱持久化记忆 | ⭐⭐⭐⭐ |
| **@modelcontextprotocol/server-sequentialthinking** | `npx -y @modelcontextprotocol/server-sequentialthinking` | `create_thought_sequence`<br>`continue_thinking`<br>`analyze_problem` | 动态问题解决 | ⭐⭐ |

## 🚨 SSH Remote 环境限制

### 核心问题

根据 Cursor 官方文档明确指出：

> **Remote Development**: Cursor directly communicates with MCP servers from your **local machine**, either directly through `stdio` or via the network using `sse`. Therefore, **MCP servers may not work properly when accessing Cursor over SSH or other development environments**.

### 限制分析

| 环境类型 | MCP 服务器运行位置 | 文件访问范围 | 是否支持 |
|---------|------------------|-------------|---------|
| **本地开发** | 本地机器 | 本地文件系统 | ✅ 完全支持 |
| **SSH Remote** | 本地机器 | 本地文件系统 | ❌ 无法访问远程文件 |
| **WSL** | WSL 内部 | WSL 文件系统 | 🟡 部分支持 |
| **Docker Container** | 容器内部 | 容器文件系统 | 🟡 部分支持 |

### 解决方案

#### 方案1: SSE Transport
```json
{
  "mcpServers": {
    "remote-filesystem": {
      "transport": "sse",
      "url": "http://remote-server:8000/sse"
    }
  }
}
```

#### 方案2: 混合架构 (推荐)
```typescript
class BCoderFileSystem {
  async readFile(path: string) {
    if (this.isRemoteEnvironment()) {
      // 使用 VSCode Remote API
      return this.readRemoteFile(path);
    } else {
      // 使用 MCP filesystem server
      return this.mcpClient.callTool('read_file', { path });
    }
  }
  
  private isRemoteEnvironment(): boolean {
    return vscode.env.remoteName !== undefined;
  }
}
```

## 🎯 BCoder 集成策略

### Tier 1 - 立即集成 (核心开发功能)
```bash
# 文件操作 (必需)
npx -y @modelcontextprotocol/server-filesystem "/workspace/path"

# Git 操作 (必需)  
npx -y @modelcontextprotocol/server-git

# Web 搜索 (重要)
npx -y @modelcontextprotocol/server-brave-search

# 内容获取 (重要)
npx -y @modelcontextprotocol/server-fetch
```

### Tier 2 - 后续集成 (增强功能)
```bash
# GitHub 集成
npx -y @modelcontextprotocol/server-github

# 数据库支持
npx -y @modelcontextprotocol/server-sqlite

# 记忆系统
npx -y @modelcontextprotocol/server-memory
```

### 配置示例

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/cuijin/workdir"]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"]
    },
    "brave-search": {
      "command": "npx", 
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-api-key"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

## 💡 关键发现

### 优势
1. **覆盖度很高**: 官方 MCP 服务器已经覆盖了大部分核心工具需求
2. **即插即用**: 所有服务器都可以通过 `npx` 直接使用，无需安装
3. **标准化**: 遵循 MCP 协议，工具接口统一
4. **维护良好**: 由 Anthropic 官方维护，质量有保证

### 挑战
1. **远程开发限制**: SSH Remote 环境下需要特殊处理
2. **网络依赖**: 部分服务器需要网络连接
3. **配置复杂**: 多个服务器的配置和管理
4. **性能考虑**: 多个 Node.js 进程的资源消耗

### 建议
1. **混合架构**: 结合 MCP 服务器和 VSCode 原生 API
2. **智能路由**: 根据环境自动选择最佳工具
3. **渐进集成**: 从核心服务器开始，逐步扩展
4. **性能优化**: 按需启动服务器，避免资源浪费

---

*相关文档: [竞品技术分析](./competitor-analysis.md)*
