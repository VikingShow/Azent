# Azent

Agent Loop 编排引擎 — 通过前馈-反馈 Loop 驱动多 Agent 协作完成开发任务。

```
用户 → TUI → Supervisor
                ├─ architect (分析设计)
                ├─ coder (编码实现)
                ├─ reviewer (代码审查)
                ├─ tester (测试验证)
                └─ debugger (调试排障)
```

## 安装

### 方式 1：bunx（零安装，推荐）

```bash
cd your-project
export OPENAI_API_KEY=your-key
bunx azent
```

### 方式 2：全局安装

```bash
bun add -g azent
cd your-project
export OPENAI_API_KEY=your-key
azent
```

### 方式 3：从源码运行

```bash
git clone https://github.com/VikingShow/Azent.git
cd Azent
bun install
bun link

# 以后在任意项目下
cd your-project
export OPENAI_API_KEY=your-key
azent
```

> 需要 [Bun](https://bun.sh) >= 1.1.0

## 使用

```bash
# 进入你的项目目录
cd my-project

# 设环境变量
export OPENAI_API_KEY=your-relay-key

# 启动
azent
```

启动后输入任务即可。默认使用 `code-review` 流程（分析→实现→审查→测试）。

### 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `OPENAI_API_KEY` | 是 | 中转站/API 的密钥 |
| `AZENT_BASE_URL` | 是 | 中转站地址（默认配置引用此变量） |

```bash
export OPENAI_API_KEY=your-key
export AZENT_BASE_URL=https://yunwu.ai/v1
```

### TUI 命令

| 命令 | 功能 |
|---|---|
| `/help` | 查看命令 |
| `/loops` | 查看可用流程 |
| `/exit` | 退出 |
| `Ctrl+C` | 强制退出 |
| 直接输入文字 | 执行任务 |

## 配置

### 配置优先级（高→低）

```
1. 项目   .azent/config/agents.yaml    项目级覆盖
2. 全局   ~/.azent/agents.yaml          用户级覆盖
3. 内置   Azent/configs/agents.yaml      开箱即用
```

**开箱即用**：不需要任何配置文件，内置默认配置已包含 5 个 Agent + 5 个 Loop 模板。只需设 `OPENAI_API_KEY` 环境变量。

### 自定义模型

内置配置使用 yunwu.ai 中转站。换成你自己的：

在项目下创建 `.azent/config/agents.yaml`：

```yaml
agents:
  coder:
    id: coder
    name: Coder
    instructions: You are a code generator.
    model:
      id: openai/gpt-4.1
      url: https://your-relay.com/v1
      apiKey: $OPENAI_API_KEY
    maxSteps: 10

# 只写要覆盖的 agent，其余用内置默认
```

> `apiKey: $OPENAI_API_KEY` — `$` 开头表示引用环境变量，不明文写入配置。

### 可用的模型接入方式

| 方式 | model 配置 |
|---|---|
| 中转站 | `{ id: "openai/gpt-4.1", url: "https://your-relay/v1", apiKey: "$KEY" }` |
| 直连官方 | `"openai/gpt-4.1"` (读 `OPENAI_API_KEY` 环境变量) |
| 本地 Ollama | `{ id: "openai/qwen2.5", url: "http://localhost:11434/v1", apiKey: "ollama" }` |

## 内置 Agent

| Agent | 模型 | 职责 |
|---|---|---|
| architect | Claude Sonnet 4.5 | 需求分析、架构设计 |
| coder | Claude Sonnet 4.5 | 编码实现 |
| reviewer | Claude Sonnet 4.5 | 代码审查 |
| tester | GPT-4.1-mini | 测试编写与运行 |
| debugger | Claude Sonnet 4.5 | 根因诊断与修复 |

## 内置 Loop 模板

| 模板 | 环节 | 适用场景 |
|---|---|---|
| code-review | 分析→实现→审查→测试 | 日常开发 |
| new-feature | 设计→实现→审查→测试 | 新功能 |
| quick-fix | 诊断→修复→验证 | 快速修复 |
| debug | 复现→诊断→修复→审查→验证 | 深度排障 |
| refactor | 评估→重构→验证→审查 | 重构优化 |

## 记忆系统

运行后自动在项目下创建 `.azent/` 目录：

```
.azent/
├── mastra.db      会话记忆 (libSQL)
└── memory/        经验向量库 (fastembed)
```

这些文件已在 `.gitignore` 中，不会提交到 git。

## MCP 工具集成

在 agent 配置中添加 MCP 服务器：

```yaml
agents:
  coder:
    mcpServers:
      filesystem:
        command: npx
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
      github:
        url: http://localhost:3000/mcp
```

## 权限控制

```yaml
agents:
  coder:
    requireApproval: true                          # 所有工具都需确认
    # 或
    requireApproval: ["filesystem_write", "bash"]  # 仅这些工具需确认
```

## 开发

```bash
git clone https://github.com/VikingShow/Azent.git
cd Azent && bun install

# 运行测试
bun test

# 类型检查
bun x tsc --noEmit

# 开发模式运行
bun run src/index.ts
```

## License

MIT
