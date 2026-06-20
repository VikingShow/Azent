# Azent 使用指南

## 1. 安装

### npm 安装（推荐）

```bash
npm i -g @sowrjam/azent
```

或零安装直接运行：

```bash
npx @sowrjam/azent
```

### 从源码安装

```bash
git clone https://github.com/VikingShow/Azent.git
cd Azent
bun install
bun link
```

> 需要 [Bun](https://bun.sh) >= 1.1.0

## 2. 环境变量

### 永久设置（推荐）

**Linux / macOS**：

```bash
echo 'export OPENAI_API_KEY=your-key' >> ~/.bashrc
echo 'export AZENT_BASE_URL=https://your-api-endpoint.com/v1' >> ~/.bashrc
source ~/.bashrc
```

> 如果你用 zsh，将 `~/.bashrc` 替换为 `~/.zshrc`。

**Windows (PowerShell)**：

```powershell
[System.Environment]::SetEnvironmentVariable('OPENAI_API_KEY', 'your-key', 'User')
[System.Environment]::SetEnvironmentVariable('AZENT_BASE_URL', 'https://your-api-endpoint.com/v1', 'User')
```

重启终端后生效。

### 临时设置

```bash
export OPENAI_API_KEY=your-key
export AZENT_BASE_URL=https://your-api-endpoint.com/v1
```

### 使用 .env 文件

在项目根目录创建 `.env`：

```env
OPENAI_API_KEY=your-key
AZENT_BASE_URL=https://your-api-endpoint.com/v1
```

## 3. 运行

```bash
cd my-project
azent
```

启动 TUI 后：
- 输入任务描述 → 自动选择 `code-review` loop 执行
- `/loops` → 查看可用 loop 模板
- `/help` → 查看命令
- `/exit` → 退出
- `Ctrl+C` → 强制退出

## 4. 配置

### 配置优先级（高→低）

```
1. 项目   .azent/config/agents.yaml    项目级覆盖
2. 全局   ~/.azent/agents.yaml          用户级覆盖
3. 内置   Azent/configs/agents.yaml      开箱即用
```

**开箱即用**：不需要任何配置文件。只需设环境变量。

### 自定义模型

在项目下创建 `.azent/config/agents.yaml`：

#### OpenAI 兼容 API

```yaml
agents:
  coder:
    id: coder
    name: Coder
    instructions: You are a code generator.
    model:
      id: openai/gpt-4.1
      url: $AZENT_BASE_URL
      apiKey: $OPENAI_API_KEY
    maxSteps: 10
```

> `$VAR` 语法：`$` 开头引用环境变量，不明文写入配置。

#### 直连官方 API

```yaml
agents:
  coder:
    model: openai/gpt-4.1    # 字符串形式，自动读 OPENAI_API_KEY
```

#### 本地 Ollama

```yaml
agents:
  coder:
    model:
      id: openai/qwen2.5
      url: http://localhost:11434/v1
      apiKey: ollama
```

### 配置 Loop 模板（`.azent/config/loops.yaml`）

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

## 5. 记忆系统

运行后自动创建：
- `.azent/mastra.db` — 会话记忆（libSQL）
- `.azent/memory/` — 向量数据（经验+项目记忆）

这些文件已在 `.gitignore` 中，不会提交到 git。

## 6. 权限控制

在 `agents.yaml` 中配置：

```yaml
agents:
  coder:
    requireApproval: true              # 所有工具调用都要确认
    # 或
    requireApproval: ["filesystem_write", "bash"]  # 仅这些工具需确认
```

执行到需要审批的工具时，TUI 会暂停并显示审批提示。

## 7. MCP 工具集成

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
