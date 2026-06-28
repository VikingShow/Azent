# Azent

AI-powered development with feedforward-feedback loops, forked from [OpenCode](https://opencode.ai).

Azent extends OpenCode with a **Zen Layer** founded on [Bounded Cognition](https://shapeofthesystem.com/posts/2026/02/03/bounded-cognition) — the principle that the mind that changes software is always far smaller than the software itself. Both humans (~4 working memory slots) and LLMs (attention dilution, "Lost in the Middle") share the same constraint: the instrument is small, narrow, and leaky. The Zen Layer answers the central question of bounded-cognition engineering: **"How do we shape the system so a small mind can work on it without bringing it all down?"** It does this not through vigilance or prompt engineering, but by building correctness into the *structure* of the system — enforced software gates, pinned instructions, and mandatory boundary declarations that survive attention decay.

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

## Zen Layer & Bounded Cognition

The Zen Layer implements *Engineering for Bounded Cognition* — externalizing cognitive load from agent and human into the system's structure.

### The Constraint

| Human Mind | LLM |
|-----------|-----|
| ~4 working memory slots (not 7) | Context window with "Lost in the Middle" effect |
| Attention is a narrow beam — the gorilla you miss | Attention is a fixed quantity — adding more dilutes it |
| Unrehearsed items decay in seconds | Instructions past the midpoint get silently dropped |

The gap isn't a few orders of magnitude you can one day close. It's the *permanent condition* of the work. Any rule you can only enforce by remembering it will eventually be forgotten. Any defence you have to run by hand gets skipped the first time there's a deadline.

### The Four-Quadrant Model

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

### How It Maps to [Shape of the System](https://shapeofthesystem.com) Tenets

| Tenet | Zen Layer Implementation |
|-------|------------------------|
| **Preamble**: 4-slot mind, Lost in the Middle | Q3 pinning system — reinjects at every safe boundary |
| **I. Locality of reasoning** | Boundary declaration makes assumptions explicit at the action point |
| **II. Make data flow explicit** | Source annotation: training_data / current_context / project_analysis |
| **III. Parse, don't validate** | Gate enforces structured declaration before destructive actions |
| **IV. Trust boundary** | Zen gate: no edit/write/bash without boundary declared |
| **XI. Separate decision from effect** | Loop mode: architect (plan) → coder (execute) → reviewer (verify) |
| **XIII. Failure modes visible** | Phase evaluation with explicit PASS/FAIL + actionable feedback |
| **XIV. One source of truth** | Pinned instructions as canonical, re-injected at safe boundaries |
| **XV. Name the boundary** | `zen_boundary` tool requires explicit naming of assumptions + unknowns |
| **XX. Reversibility** | Session revert + non-destructive-by-default gate |
| **XXI. Simplicity is budget** | Zen Layer reduces cognitive load by externalizing it into structure |

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
