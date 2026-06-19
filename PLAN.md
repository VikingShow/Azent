# Azent 项目计划文档

## 1. 项目定位

**Azent** 是一个基于 Mastra 框架的 Agent Loop 编排引擎，以 TUI 形式运行。核心理念：将 Agent 视为可配置的资源，通过前馈-反馈 Loop 驱动任务执行，全程可控可干预。

## 2. 核心设计

### 2.1 两个 Loop

| | 大 Loop | 小 Loop |
|---|---|---|
| 范围 | 用户 → Supervisor → 用户 | Supervisor → 子Agent → Supervisor |
| 机制 | Loop 模板 phases 推进 | 前馈-反馈比对 |
| 产出 | 汇总结果给用户 | 单个 phase 产出 |
| 异常 | 中止请求用户介入 | 重试 → 超限升级 Supervisor |

### 2.2 架构图

```
用户 ←→ TUI (Ink) ←→ Mastra 实例
                        │
                  Supervisor Agent (编排者)
                   ├─ Loop 模板驱动 (YAML)
                   ├─ 前馈(demand) → 子Agent → 产出 → 比对 → 通过/重试/升级
                   ├─ 权限控制 (requireApproval + suspend)
                   └─ 记忆体系
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
        coder       reviewer      tester
        (子Agent)   (子Agent)    (子Agent)
        + MCP工具   + MCP工具    + 脚本资源
```

## 3. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 语言 | TypeScript + Bun | 单二进制编译，TUI 方便 |
| Agent 框架 | Mastra (`@mastra/core`) | Supervisor/Memory/Approval/Guard 全内置 |
| 会话存储 | libSQL (`@mastra/libsql`) | 嵌入式 SQLite，零配置 |
| 向量存储 | LanceDB | 项目记忆 + 经验记忆语义检索 |
| 嵌入模型 | `@mastra/fastembed` | 本地运行，零 API Key |
| MCP 集成 | `@mastra/mcp` | MCPClient 内置 |
| 配置校验 | Zod + YAML | 类型安全 + 人手写友好 |
| TUI | Ink (React) | 组件化终端 UI |
| 测试 | Bun test | 零依赖内置 |

## 4. 记忆模型

```
记忆体系
├── 项目记忆 (Project Memory) — 持久/跨session
│   ├── 来源: Agent 自动分析 + 用户手动添加
│   ├── 存储: LanceDB + fastembed
│   ├── 更新: 触发式 (任务失败/成功/手动命令/TTL 30天)
│   └── 内容: 架构、约定、技术栈、关键逻辑
│
├── 经验记忆 (Experience Memory) — 持久/跨task
│   ├── 来源: 每个 Loop 完成后自动记录
│   ├── 存储: LanceDB + fastembed
│   ├── 更新: 增量追加 + 定期整理合并去重
│   └── 内容: {前馈, 产出, 问题, 方案, 失败模式, 已验证模式}
│
├── 会话记忆 (Session Memory) — 临时/单session
│   ├── 来源: Mastra 自动管理
│   ├── 存储: mastra.db (libSQL)
│   ├── 嵌入模型: 不需要
│   └── 内容: 当前对话消息历史
│
└── 工作记忆 (Working Memory) — 持久/跨session
    ├── 来源: Mastra 自动管理
    ├── 存储: mastra.db
    ├── 嵌入模型: 不需要
    └── 内容: 用户偏好、当前工作状态
```

### 记忆过期策略

| 触发条件 | 更新内容 | 执行者 |
|---|---|---|
| 任务失败 + 原因指向记忆过时 | 标记 stale，Agent 重新分析 | 自动 |
| 任务成功 + 产出涉及结构变更 | 增量更新受影响记忆 | 自动 |
| 用户执行 `/azent refresh` | 全量重新分析项目记忆 | 手动 |
| 用户主动说"记住 X" | 插入/更新项目记忆 | 手动 |
| 记忆 30 天未访问 | 标记 stale，用到时重新验证 | 自动 |

## 5. Loop 模板设计

### 5.1 配置示例 (`configs/loops.yaml`)

```yaml
loops:
  code-review:
    name: "代码审查流程"
    allowModification: true
    phases:
      - id: analyze
        name: "需求分析"
        acceptance: "明确需要改什么、为什么改"
        agent: "coder"
      - id: implement
        name: "编码实现"
        acceptance: "代码通过 lint 和类型检查"
        agent: "coder"
      - id: review
        name: "代码审查"
        acceptance: "无安全漏洞、无性能问题"
        agent: "reviewer"
      - id: test
        name: "测试验证"
        acceptance: "测试覆盖率 >= 80%"
        agent: "tester"

  quick-fix:
    name: "快速修复流程"
    allowModification: false
    phases:
      - id: diagnose
        name: "诊断问题"
        agent: "coder"
      - id: fix
        name: "修复"
        agent: "coder"
      - id: verify
        name: "验证"
        agent: "reviewer"
```

### 5.2 核心逻辑

1. 按模板 phases 顺序推进
2. 每个 phase 执行 → 产出与前馈比对
3. `allowModification: true` → Agent 可建议跳过/新增 phase，需用户确认
4. `allowModification: false` → 严格按模板，跳过即中止

## 6. 权限控制

基于 Mastra 的 `requireApproval` + `suspend()` 机制：

- YAML 配置中声明哪些工具/操作需要 approval
- 执行前中止，TUI 弹出确认对话框
- 用户批准 → 继续；拒绝 → 中止
- 审批请求通过 Supervisor 链向上传播

## 7. 项目结构

```
Azent/
├── src/
│   ├── index.ts               # 入口
│   ├── mastra.ts              # Mastra 实例注册
│   ├── config/
│   │   ├── schema.ts          # Zod schema (Agent + LoopTemplate + Memory)
│   │   ├── loader.ts          # YAML → Mastra Agent 实例
│   │   └── types.ts           # 共享类型
│   ├── orchestrator/
│   │   ├── supervisor.ts      # Supervisor Agent 定义 + hooks
│   │   └── loop.ts            # 前馈-反馈 Loop 引擎 (读取模板)
│   ├── memory/
│   │   ├── project.ts         # 项目记忆 (LanceDB + 过期策略)
│   │   ├── experience.ts      # 经验记忆 (LanceDB + 整理)
│   │   └── consolidate.ts     # 定期整理 + 合并去重
│   └── tui/
│       ├── app.tsx            # Ink App 入口
│       └── components.tsx     # 对话/状态/审批组件
├── tests/
│   ├── config.test.ts
│   ├── orchestrator.test.ts
│   └── memory.test.ts
├── configs/
│   ├── agents.yaml            # Agent 定义示例
│   └── loops.yaml             # Loop 模板示例
├── package.json
├── tsconfig.json
└── bunfig.toml
```

## 8. 配置目录结构

### 全局配置 (`~/.azent/`)

```
~/.azent/
├── config.yaml          # 用户偏好 (默认模型、语言、代码风格)
└── agents.yaml          # 跨项目共享的 Agent 定义 (可选)
```

### 项目配置 (`.azent/`)

```
my-project/
├── .azent/
│   ├── config/
│   │   ├── agents.yaml  # 项目专属 Agent 定义
│   │   └── loops.yaml   # Loop 模板
│   ├── memory/          # LanceDB 数据 (项目记忆 + 经验记忆)
│   ├── mastra.db        # Mastra 会话存储
│   └── .gitignore       # memory/ + mastra.db 不入 git
```

**加载优先级**：项目 `.azent/config/` > 全局 `~/.azent/`

## 9. 依赖清单

```
@mastra/core
@mastra/memory
@mastra/mcp
@mastra/libsql
@mastra/fastembed
ink
yaml
zod
vectordb (LanceDB Node.js 绑定)
```

## 10. 实施阶段

### 阶段 0：项目初始化
- Clone `https://github.com/VikingShow/Azent.git`
- 创建空分支 `tui` (孤儿分支)
- `bun init` + 安装依赖
- 初始化 tsconfig.json、bunfig.toml
- 写入计划文档

### 阶段 1：配置系统
- `config/schema.ts` — Zod schema (Agent、LoopTemplate、MemoryConfig)
- `config/loader.ts` — YAML 加载 → Mastra Agent 实例
- `config/types.ts` — 共享类型定义
- `configs/agents.yaml` — 示例 Agent 配置
- `configs/loops.yaml` — 示例 Loop 模板
- `tests/config.test.ts`

### 阶段 2：Mastra 实例 + Agent 定义
- `mastra.ts` — Mastra 实例 (agents、memory、MCP、storage)
- 从 YAML 配置生成 Agent 实例
- MCPClient 集成

### 阶段 3：编排引擎
- `orchestrator/supervisor.ts` — Supervisor Agent + delegation hooks
- `orchestrator/loop.ts` — 前馈-反馈 Loop 引擎
- `tests/orchestrator.test.ts`

### 阶段 4：记忆系统
- `memory/project.ts` — 项目记忆 + 过期策略
- `memory/experience.ts` — 经验记忆
- `memory/consolidate.ts` — 定期整理
- `tests/memory.test.ts`

### 阶段 5：TUI 界面
- `tui/app.tsx` — Ink App 入口
- `tui/components.tsx` — 对话/状态/审批组件
- `index.ts` — 入口

### 阶段 6：集成测试
- 端到端 Loop 流程测试
- 记忆系统联调
- TUI 交互验证
