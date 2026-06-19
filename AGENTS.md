# Azent

Agent Loop 编排引擎，基于 Mastra 框架，以 TUI 形式运行。

## 技术栈

- **语言**: TypeScript + Bun
- **Agent 框架**: Mastra (`@mastra/core`, `@mastra/memory`, `@mastra/mcp`, `@mastra/libsql`, `@mastra/fastembed`)
- **向量存储**: LanceDB
- **TUI**: Ink (React)
- **配置**: Zod + YAML
- **测试**: Bun test

## 常用命令

```bash
# 安装依赖
bun install

# 运行测试
bun test

# 运行单个测试文件
bun test tests/config.test.ts

# 运行 TUI
bun run src/index.ts

# 类型检查
bun x tsc --noEmit
```

## 代码约定

- 每个 TypeScript 文件使用 ESM (`import/export`)
- 类型定义放 `config/types.ts`，用 Zod schema 做运行时校验
- 测试文件放 `tests/` 目录，命名 `*.test.ts`
- 配置文件用 YAML，放 `configs/` 目录
- 不添加注释，除非用户明确要求

## 目录结构

```
src/
├── index.ts           # 入口
├── mastra.ts          # Mastra 实例注册
├── config/            # 配置系统 (schema, loader, types)
├── orchestrator/      # 编排引擎 (supervisor, loop)
├── memory/            # 记忆系统 (project, experience, consolidate)
└── tui/               # 终端 UI (app, components)
tests/                 # 单元测试
configs/               # 示例配置 (agents.yaml, loops.yaml)
```

## 记忆体系

- **项目记忆**: LanceDB + fastembed，触发式更新
- **经验记忆**: LanceDB + fastembed，增量追加 + 定期整理
- **会话记忆**: Mastra Memory (libSQL)，自动管理
- **工作记忆**: Mastra Working Memory，自动管理

## Loop 模板

YAML 定义，每个 phase 有 `acceptance` 验收标准。`allowModification` 控制 Agent 能否增减环节。
