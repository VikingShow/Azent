# Azent

AI-powered development with feedforward-feedback loops, forked from [OpenCode](https://opencode.ai).

## Core Philosophy

Azent is built on a single, deliberately accepted premise:

> **The mind that changes software is always far smaller than the software itself.**

This is not a bug to fix. It is the **permanent condition** of the work.

Humans hold ~4 working memory slots (Cowan 2001), not 7. Unrehearsed items decay in ~20 seconds (Peterson & Peterson 1959). Attention is a narrow beam that misses the gorilla in the room (Simons & Chabris 1999). LLMs share the exact same constraint — "Lost in the Middle" (Liu et al. 2023) means instructions past the context midpoint get silently dropped. Adding more to the prompt doesn't help. Adding more to the context window doesn't help. **More is just more to forget.**

Most AI coding tools respond to this by trying harder: longer prompts, more detailed instructions, bigger context windows. Azent does the opposite.

Azent **accepts** the limitation and builds a system around it. The question is not "how do we make the agent remember more?" The question is: **"How do we shape the system so a small, leaky mind can work on it safely?"**

The answer is the **Zen Layer** — a set of structural mechanisms that externalize cognitive load from the agent (and the human) into the system itself. Any rule you can only enforce by remembering it will eventually be forgotten. So the Zen Layer doesn't rely on remembering. It relies on **structure**.

---

## The Zen Layer

### The Four-Quadrant Model

The model maps two dimensions: whether an instruction is explicitly declared, and whether the agent follows it.

```
                Agent follows instructions    Agent does not follow
              ┌──────────────────────────┬──────────────────────────┐
Explicitly    │  Q1: Declared, followed    │  Q3: Declared, but not   │
declared      │  Ideal state               │  Context drift occurred  │
              │                            │  (attention decayed,     │
              │                            │   instruction forgotten) │
              ├──────────────────────────┼──────────────────────────┤
Not           │  Q2: Context.Env           │  Q4: Irrelevant          │
explicitly    │  Implicit knowledge at     │  Default safe            │
declared      │  work (training data,      │                          │
              │  conventions, context)     │                          │
              └──────────────────────────┴──────────────────────────┘
```

### The State Machine — Attention Maintenance

The four quadrants are not just categories. They form a **state machine** whose transitions ARE the attention maintenance mechanism:

```
Q4 (default safe — nothing declared, nothing happening)
  │
  │ Agent acts on implicit knowledge — training data, project conventions, context
  ▼
Q2 (DANGER — Agent is making assumptions it hasn't declared)
  │
  │ Gate blocks destructive action → Agent MUST call zen_boundary
  │ Agent declares: "I understand X, I assume Y, I know Z from source W,
  │                  I'm confident about A but unsure about B"
  │ If uncertain → MUST confirm with human before proceeding
  ▼
Q1 (declared + confirmed + following — the ideal state)
  │
  │ Context grows → attention dilutes → instructions slip past midpoint
  ▼
Q3 (Agent was told something but forgot — instruction drift)
  │
  │ checkDrift detects violation → escalate → Gate closes
  │ Pinned instructions re-injected → Agent MUST re-declare boundary
  ▼
Q1 (back to ideal state — re-anchored)
```

Each transition is an **attention maintenance operation**:
- **Q2→Q1**: Externalization — making implicit knowledge explicit and testable
- **Q1→Q3→Q1**: Detection + Correction — noticing when attention has drifted and re-anchoring it

### The Central Principle: When Uncertain, Confirm With Human

This is the most important rule in the Zen Layer:

> **If the agent doesn't know something with confidence, it MUST NOT act. It MUST ask the human.**

This is enforced through three mechanisms:

| Mechanism | Trigger | Response |
|-----------|---------|----------|
| **Gate: block** | No boundary declared | Destructive tool is blocked. Agent must call `zen_boundary`. |
| **Gate: clarify** | Boundary declared but confidence is low, or unknowns remain | Agent must use the `question` tool to confirm with the user before proceeding. |
| **Gate: escalate** | Drift detected on critical pinned instructions | Gate closes. Agent must re-declare boundary and get user confirmation. |

The agent cannot bypass these. The Gate is **software-enforced** — no edit, write, bash, shell, or apply_patch executes without the Gate being open.

### The Three Protocols

**Q2 Protocol — Boundary Declaration (`zen_boundary`)**

Before any destructive action (edit, write, bash, shell, apply_patch), the agent must declare:
- What it understands the task to be
- What assumptions it is making
- What implicit knowledge it is drawing from (training data, project context, conventions, past experience) — and how confident it is
- What its plan is
- What it does NOT know and needs clarification on

This transforms invisible assumptions into **testable declarations**. The human can see exactly what the agent thinks it knows and challenge any assumption.

**Q3 Protocol — Instruction Pinning (`zen_pin`, `/pin`)**

Critical instructions fade from the LLM's attention window as conversation progresses. Pinned instructions are **re-injected at every safe boundary** — every agent turn, every context render. They survive context dilution by sheer repetition.

Users pin instructions via `/pin NEVER use console.log` or `/pin all API calls must have error handling`. The system auto-pins CRITICAL:/NEVER:/MUST: constraints from AGENTS.md at session start.

**Drift Detection + Escalation (`checkDrift`, `escalate`)**

After each agent turn, the system checks whether the agent's output violates any pinned instruction. If a critical instruction has been violated:
1. Drift alert is appended to the agent's output
2. `escalate` is triggered — the Gate closes
3. The agent must re-declare its boundary before continuing

This creates a **closed feedback loop**: detect → correct → re-anchor.

---

## Architecture

```
@sowrjam/azent (monorepo)
├── packages/core/     @azent/core       Infrastructure: Effect services, DB schema, SessionV2
│   ├── src/session/                     Session lifecycle, execution, history, runner
│   ├── src/tool/                        Tool.make, ToolRegistry abstraction
│   ├── src/system-context/              Composable typed context sources
│   ├── src/zen.ts                       Zen Layer Effect Service
│   └── src/public/                      Stable public API surface
│
├── packages/app/      @azent/app        Application orchestration layer
│   ├── src/index.ts                     CLI entry (yargs, 20+ commands)
│   ├── src/session/prompt.ts            Core session loop
│   ├── src/session/loop/                Loop Mode engine + phase evaluation
│   ├── src/agent/agent.ts               Agent definitions (build, plan, supervisor)
│   ├── src/tool/                        Tool implementations
│   ├── src/experience/                  Experience memory store
│   └── src/command/                     Slash command system
│
├── packages/llm/      @azent/llm        Effect-native LLM protocol abstraction
├── packages/tui/      @azent/tui        Terminal UI (SolidJS + OpenTUI)
├── packages/ui/       @azent/ui         Web UI components
├── packages/server/   @azent/server     HTTP API server
└── packages/plugin/   @azent/plugin     Plugin system package
```

## Modes

| Mode | Description |
|------|-------------|
| **Build** | Single-agent task execution with full tool access. Zen Gate enforced. |
| **Plan** | Read-only research + Q&A. Writes plan to `.azent/plans/*.md`. Phase 3 requires `zen_boundary` before writing plan. |
| **Loop (Supervisor)** | Multi-phase orchestration. Each phase runs as an independent sub-agent. Per-phase Zen boundary reset forces re-declaration between phases. Pluggable evaluation strategies (keyword, regex, LLM, script, tool_output). |

## Commands

| Command | Description |
|---------|-------------|
| `/zen` | Show Zen Layer state — Gate, Boundary, Pinned instructions, Capabilities |
| `/pin <instruction>` | Pin critical instructions to survive context dilution (Q3 anti-drift) |
| `/loop` | Manage loop templates — save, load, list, remove multi-phase plans |
| `/capabilities` | Show agent capabilities |
| `/init` | Guided AGENTS.md setup |
| `/review` | Code review |

---

## Design Philosophy: "Out of Control" & Distributed Safety

Azent's architecture resonates with Kevin Kelly's *Out of Control* (1994), which argues that complex systems cannot be managed through centralized, top-down control. Instead, they require **distributed, bottom-up mechanisms** where order emerges from simple local rules.

"Out of control" does not mean chaos. It means the **absence of a central controller** — systems that govern themselves through distributed feedback loops.

| *Out of Control* Principle | Azent Implementation |
|---------------------------|---------------------|
| **Absence of centralized control** | No single rule or prompt controls the agent. Gate, drift check, and pinning form a distributed safety net where each component provides independent guarantees. |
| **Autonomous subunits** | Each Loop Mode phase runs as an independent sub-agent with its own boundary declaration. A violation in one phase doesn't crash the system — it's contained and corrected locally. |
| **Subsumption architecture** (Brooks 1986) | Q4 → Q2 → Q1 → Q3 layers stack without replacing lower layers. Each transition adds guarantees: safety → awareness → compliance → alertness → correction. |
| **Honor your errors** | Drift violations aren't failures — they're feedback. `checkDrift` → `escalate` → re-declare. Experience Store records patterns for future reference. |
| **Bottom-up control** | Rules emerge from the project context (AGENTS.md auto-pinning), not just from top-down commands. The agent discovers and surfaces constraints rather than being told everything upfront. |
| **Grow by chunking** | Loop Mode phases compose like Brooks' behavioral layers. Each phase must pass before the next begins. Complexity is grown, not designed all at once. |
| **The network as icon** | Zen context, experience memory, and pinned instructions flow between all components. Knowledge is distributed, not centralized in a single prompt. |

The Zen Layer's insight parallels Kelly's central thesis: just as biological systems don't rely on a single brain to coordinate every cell, **AI agent safety cannot rely on a single prompt to constrain every action**. Safety must be distributed into the structure — gates, boundaries, pins, drift checks — each providing a partial guarantee that composes into a stronger whole.

---

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
bun test # runs tests
```

## License

MIT — forked from [OpenCode](https://github.com/anomalyco/opencode)
