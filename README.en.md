# Azent

Agent Loop orchestration engine — drives multi-agent collaboration through feedforward-feedback loops.

```
User → TUI → Supervisor
                ├─ architect (analysis & design)
                ├─ coder (implementation)
                ├─ reviewer (code review)
                ├─ tester (testing)
                └─ debugger (debugging)
```

[中文文档](./README.md)

## Installation

> Requires [Bun](https://bun.sh) >= 1.1.0

### Option 1: npm / bunx (zero install, recommended)

```bash
cd your-project
npx @sowrjam/azent
```

### Option 2: Global install

```bash
npm i -g @sowrjam/azent
cd your-project
azent
```

### Option 3: From source

```bash
git clone https://github.com/VikingShow/Azent.git
cd Azent
bun install
bun link

# Then in any project
cd your-project
azent
```

## Environment Variables

Azent requires two environment variables to connect to your LLM API:

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | API key |
| `AZENT_BASE_URL` | Yes | API endpoint URL |

### Temporary (current terminal session only)

```bash
export OPENAI_API_KEY=your-key
export AZENT_BASE_URL=https://your-api-endpoint.com/v1
```

### Permanent

**Linux / macOS (bash/zsh)**:

```bash
echo 'export OPENAI_API_KEY=your-key' >> ~/.bashrc
echo 'export AZENT_BASE_URL=https://your-api-endpoint.com/v1' >> ~/.bashrc
source ~/.bashrc
```

> Replace `~/.bashrc` with `~/.zshrc` if using zsh.

**Windows (PowerShell)**:

```powershell
[System.Environment]::SetEnvironmentVariable('OPENAI_API_KEY', 'your-key', 'User')
[System.Environment]::SetEnvironmentVariable('AZENT_BASE_URL', 'https://your-api-endpoint.com/v1', 'User')
```

Restart your terminal after setting.

**Using .env file**:

Create a `.env` file in your project root:

```env
OPENAI_API_KEY=your-key
AZENT_BASE_URL=https://your-api-endpoint.com/v1
```

## Usage

```bash
cd my-project
azent
```

Type a task to run. Defaults to the `code-review` loop (analyze → implement → review → test).

### TUI Commands

| Command | Action |
|---|---|
| `/help` | Show commands |
| `/loops` | List available loops |
| `/exit` | Quit |
| `Ctrl+C` | Force quit |
| Type anything | Run a task |

## Configuration

### Config Priority (high → low)

```
1. Project   .azent/config/agents.yaml    Project-level overrides
2. Global    ~/.azent/agents.yaml          User-level overrides
3. Built-in  Azent/configs/agents.yaml      Out of the box
```

**Zero config**: No config file needed. Built-in defaults include 5 Agents + 5 Loop templates. Just set environment variables.

### Custom Models

Create `.azent/config/agents.yaml` in your project:

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

# Only override what you need; the rest uses built-in defaults
```

> `$VAR` syntax: prefix with `$` to reference an environment variable instead of hardcoding secrets.

### Model Connection Options

| Method | model config |
|---|---|
| OpenAI-compatible API | `{ id: "openai/gpt-4.1", url: "$AZENT_BASE_URL", apiKey: "$OPENAI_API_KEY" }` |
| Direct (official) | `"openai/gpt-4.1"` (auto-reads `OPENAI_API_KEY` env var) |
| Local Ollama | `{ id: "openai/qwen2.5", url: "http://localhost:11434/v1", apiKey: "ollama" }` |

## Built-in Agents

| Agent | Model | Role |
|---|---|---|
| architect | Claude Sonnet 4.5 | Requirement analysis, architecture design |
| coder | Claude Sonnet 4.5 | Code implementation |
| reviewer | Claude Sonnet 4.5 | Code review |
| tester | GPT-4.1-mini | Test writing & execution |
| debugger | Claude Sonnet 4.5 | Root-cause diagnosis & fix |

## Built-in Loop Templates

| Template | Phases | Use Case |
|---|---|---|
| code-review | analyze → implement → review → test | Daily development |
| new-feature | design → implement → review → test | New features |
| quick-fix | diagnose → fix → verify | Quick fixes |
| debug | reproduce → diagnose → fix → review → verify | Deep debugging |
| refactor | assess → refactor → verify → review | Refactoring |

## Memory System

Running Azent creates a `.azent/` directory in your project:

```
.azent/
├── mastra.db      Session memory (libSQL)
└── memory/        Experience vectors (fastembed)
```

These are in `.gitignore` and won't be committed.

## MCP Tool Integration

Add MCP servers in your agent config:

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

## Permission Control

```yaml
agents:
  coder:
    requireApproval: true                          # Require approval for all tools
    # or
    requireApproval: ["filesystem_write", "bash"]  # Only these tools require approval
```

## Development

```bash
git clone https://github.com/VikingShow/Azent.git
cd Azent && bun install

# Run tests
bun test

# Type check
bun x tsc --noEmit

# Dev mode
bun run src/index.ts
```

## License

MIT
