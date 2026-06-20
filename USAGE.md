# Azent 使用指南

## 1. 安装

```bash
git clone -b tui https://github.com/VikingShow/Azent.git
cd Azent
bun install
```

## 2. 配置

### 2.1 创建项目配置目录

在你的**目标项目**根目录下创建 `.azent/config/`：

```bash
mkdir -p .azent/config
```

### 2.2 配置 Agent（`.azent/config/agents.yaml`）

#### 方式 A：使用中转站（API 代理）

如果你用中转站（如 one-api、new-api 等 OpenAI 兼容代理），配置 `url` 和 `apiKey`：

```yaml
agents:
  coder:
    id: coder
    name: Coder
    instructions: You are a code generator.
    model:
      id: openai/gpt-4.1           # provider/model 格式
      url: https://your-relay.com/v1  # 中转站地址
      apiKey: $OPENAI_API_KEY       # $ 开头引用环境变量
    maxSteps: 10
    memory: true

global:
  defaultModel:
    id: openai/gpt-4.1
    url: https://your-relay.com/v1
    apiKey: $OPENAI_API_KEY
```

#### 方式 B：直连官方 API

不填 `url`，只设环境变量即可（Mastra 自动读取 `OPENAI_API_KEY` 等）：

```yaml
agents:
  coder:
    id: coder
    name: Coder
    instructions: You are a code generator.
    model: openai/gpt-4.1    # 字符串形式，用官方端点
    maxSteps: 10
```

```bash
export OPENAI_API_KEY=sk-xxx
```

#### 方式 C：本地模型（Ollama）

```yaml
agents:
  coder:
    id: coder
    name: Coder
    instructions: You are a code generator.
    model:
      id: openai/qwen2.5      # Ollama 提供 OpenAI 兼容接口
      url: http://localhost:11434/v1
      apiKey: ollama            # Ollama 不需要真实 key，随意填
```

### 2.3 配置 Loop 模板（`.azent/config/loops.yaml`）

```yaml
loops:
  code-review:
    name: "代码审查流程"
    allowModification: true
    phases:
      - id: analyze
        name: "需求分析"
        acceptance: "明确需要改什么"
        agent: coder
      - id: implement
        name: "编码实现"
        acceptance: "代码通过类型检查"
        agent: coder
      - id: review
        name: "代码审查"
        acceptance: "无安全问题"
        agent: reviewer
```

### 2.4 环境变量

```bash
# .env 文件或 shell 导出
OPENAI_API_KEY=sk-your-key          # 中转站 API Key
# OPENAI_BASE_URL 可选，但推荐在 YAML 里配 url
```

`apiKey: $OPENAI_API_KEY` 语法：`$` 开头表示引用环境变量名，不会明文写入配置文件。

### 2.5 全局配置（可选，`~/.azent/config.yaml`）

跨项目共享的默认配置：

```yaml
defaultModel:
  id: openai/gpt-4.1
  url: https://your-relay.com/v1
  apiKey: $OPENAI_API_KEY
language: zh-CN
```

项目级 `.azent/config/agents.yaml` 会覆盖全局配置。

## 3. 运行

```bash
bun run src/index.ts
```

启动 TUI 后：
- 输入任务描述 → 自动选择 `code-review` loop 执行
- `/loops` → 查看可用 loop 模板
- `/help` → 查看命令
- `/exit` → 退出
- `Ctrl+C` → 强制退出

## 4. 记忆系统

运行后自动创建：
- `.azent/mastra.db` — 会话记忆（libSQL）
- `.azent/memory/` — 向量数据（经验+项目记忆）

这些文件已在 `.gitignore` 中，不会提交到 git。

## 5. 权限控制

在 `agents.yaml` 中配置：

```yaml
agents:
  coder:
    requireApproval: true              # 所有工具调用都要确认
    # 或
    requireApproval: ["filesystem_write", "bash"]  # 仅这些工具需确认
```

执行到需要审批的工具时，TUI 会暂停并显示审批提示。

## 6. MCP 工具集成

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

Agent 启动时自动发现并加载所有 MCP 工具。

## 7. 快速验证

```bash
# 1. 在项目根目录创建配置
mkdir -p .azent/config

# 2. 复制示例配置并修改
cp /path/to/Azent/configs/agents.yaml .azent/config/
cp /path/to/Azent/configs/loops.yaml .azent/config/
# 编辑 agents.yaml，填入你的中转站 url 和 apiKey

# 3. 设置环境变量
export OPENAI_API_KEY=your-relay-key

# 4. 运行
cd /path/to/Azent
bun run src/index.ts
```
