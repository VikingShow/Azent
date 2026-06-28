# Azent

AI-powered development with feedforward-feedback loops, forked from [OpenCode](https://opencode.ai).

Azent extends OpenCode with a **Zen Layer** that transforms the agent from a blind executor into a rigorous thinking partner — surfacing implicit knowledge, pinning critical instructions against context drift, and enforcing structured boundary declarations before destructive actions.

## Architecture

```
@soarjam/azent (monorepo)
├── packages/core/     @azent/core       Infrastructure: Effect services, DB schema, SessionV2
│   ├── src/session/                     Session lifecycle, execution, history, runner
│   ├── src/tool/                        Tool.make, ToolRegistry abstraction
│   ├── src/system-context/              Composible typed context sources
│   ├── src/zen.ts                       Zen Layer Effect Service (boundary, gate, pinning)
│   └── src/public/                      Stable public API surface
│
├── packages/app/      @azent/app        Application orchestration layer
│   ├── src/index.ts                     CLI entry (yargs, 20+ commands)
│   ├── src/session/prompt.ts            Core session loop (1700+ lines)
│   ├── src/session/loop/                Loop Mode engine + phase evaluation
│   ├── src/agent/agent.ts               Agent definitions (build, plan, supervisor)
│   ├── src/tool/                        Tool implementations (bash, edit, zen_boundary...)
│   ├── src/experience/                   Experience memory store
│   └── src/zen/                         (Zen tool implementations)
│
├── packages/llm/      @azent/llm        Effect-native LLM protocol abstraction
├── packages/tui/      @azent/tui        Terminal UI (SolidJS + OpenTUI)
├── packages/ui/       @azent/ui         Web UI components
└── packages/server/   @azent/server     HTTP API server
```

## Modes

| Mode | Description |
|------|-------------|
| **Build** | Single-agent task execution with full tool access |
| **Plan** | Read-only research + Q&A. Writes plan to `.opencode/plans/*.md`, then exits via `plan_exit` |
| **Loop (Supervisor)** | Multi-phase orchestration: architect → coder → reviewer → tester, with LLM-based evaluation at each phase |

## Zen Layer — The Four-Quadrant Model

The Zen Layer is founded on a four-quadrant understanding of agent behavior:

```
                Agent follows instructions    Agent does not follow
              ┌──────────────────────────┬──────────────────────────┐
Explicitly    │  Q1: Declared, followed    │  Q3: Declared, but not   │
declared      │  Ideal state               │  Context drift occurred  │
              │                            │  (instruction fell out   │
              │                            │   of attention window)   │
              ├──────────────────────────┼──────────────────────────┤
Not           │  Q2: Context.Env           │  Q4: Irrelevant          │
explicitly    │  Implicit knowledge at     │  Default safe            │
declared      │  work (training data,      │                          │
              │  conventions, context)     │                          │
              └──────────────────────────┴──────────────────────────┘
```

### Q1 — Explicit execution (ideal)
Instructions are clearly stated and correctly followed. The Zen Layer records successful execution patterns for future reference.

### Q2 — Implicit knowledge surfacing
The agent acts on knowledge it wasn't explicitly told — training data patterns, project conventions, or contextual inferences. The Zen Layer's `zen_boundary` tool requires the agent to declare its implicit knowledge sources, assumptions, and confidence levels before any destructive action.

### Q3 — Instruction pinning (anti-drift)
Critical instructions fade from the agent's attention window as conversation progresses. The Zen Layer's pinning system re-injects key instructions at every safe boundary, preventing context drift.

### Q4 — Default safety
Neither declared nor executed. No intervention needed.

## Quick Start

```bash
npm i -g @sowrjam/azent
# requires Bun >= 1.1.0
azent
```

## Development

```bash
git clone https://github.com/VikingShow/Azent.git
cd Azent
bun install
bun dev  # starts TUI in dev mode
bun test # runs tests from packages/app
```

## License

MIT — forked from [OpenCode](https://github.com/anomalyco/opencode)
