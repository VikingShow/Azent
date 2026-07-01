# Azent

AI-powered development with feedforward-feedback loops, forked from [OpenCode](https://opencode.ai).

Azent extends OpenCode with a **Zen Layer** founded on [Bounded Cognition](https://shapeofthesystem.com/posts/2026/02/03/bounded-cognition) — the principle that the mind that changes software is always far smaller than the software itself. Both humans (~4 working memory slots) and LLMs (attention dilution, "Lost in the Middle") share the same constraint: the instrument is small, narrow, and leaky. The Zen Layer answers the central question of bounded-cognition engineering: **"How do we shape the system so a small mind can work on it without bringing it all down?"**

## Architecture

```
@sowrjam/azent (monorepo)
├── packages/core/     @azent/core       Infrastructure: Effect services, DB schema, SessionV2
│   ├── src/session/                     Session lifecycle, execution, history, runner
│   ├── src/tool/                        Tool.make, ToolRegistry abstraction
│   ├── src/system-context/              Composable typed context sources
│   ├── src/zen.ts                       Zen Layer Effect Service (boundary, gate, pinning)
│   └── src/public/                      Stable public API surface
│
├── packages/app/      @azent/app        Application orchestration layer
│   ├── src/index.ts                     CLI entry (yargs, 20+ commands)
│   ├── src/session/prompt.ts            Core session loop
│   ├── src/session/loop/                Loop Mode engine + phase evaluation
│   ├── src/agent/agent.ts               Agent definitions (build, plan, supervisor)
│   ├── src/tool/                        Tool implementations (bash, edit, zen_boundary...)
│   ├── src/experience/                  Experience memory store
│   └── src/command/                     Slash command system (/pin, /zen, /loop, ...)
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
| **Build** | Single-agent task execution with full tool access |
| **Plan** | Read-only research + Q&A. Writes plan to `.azent/plans/*.md`, then exits via `plan_exit` |
| **Loop (Supervisor)** | Multi-phase orchestration with pluggable evaluation strategies, template persistence, and per-phase Zen boundary enforcement |

## Commands

| Command | Description |
|---------|-------------|
| `/init` | Guided AGENTS.md setup |
| `/review` | Code review |
| `/zen` | Show Zen Layer state — gate, boundary, pinned instructions, capabilities |
| `/pin` | Pin critical instructions to survive context dilution (Q3 anti-drift) |
| `/loop` | Manage loop templates — save, load, list, remove multi-phase plans |
| `/capabilities` | Show agent capabilities |

## Zen Layer & Bounded Cognition

The Zen Layer implements *Engineering for Bounded Cognition* — externalizing cognitive load from agent and human into the system's structure.

### The Constraint

| Human Mind | LLM |
|-----------|-----|
| ~4 working memory slots (not 7) | Context window with "Lost in the Middle" effect |
| Attention is a narrow beam — the gorilla you miss | Attention is a fixed quantity — adding more dilutes it |
| Unrehearsed items decay in seconds | Instructions past the midpoint get silently dropped |

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

The four quadrants form a **state machine**:

```
Q4 (default safe) → Q2 (agent acts on implicit knowledge)
  → Gate blocks → requires zen_boundary declaration
Q2 → Q1 (boundary declared → gate opens → instructions followed)
Q1 → Q3 (context dilution → instruction drift)
  → checkDrift detects → escalates → gate closes
Q3 → Q1 (re-declare boundary → back to ideal state)
```

### Q1 — Explicit execution (ideal)

Instructions are clearly stated and correctly followed. The Zen Layer records successful execution patterns for future reference.

### Q2 — Implicit knowledge surfacing

The agent acts on knowledge it wasn't explicitly told — training data patterns, project conventions, or contextual inferences. The `zen_boundary` tool requires the agent to declare its implicit knowledge sources, assumptions, and confidence levels before any destructive action. **Auto-pinning** extracts CRITICAL/NEVER/MUST constraints from system instructions at session start.

### Q3 — Instruction pinning (anti-drift)

Critical instructions fade from the agent's attention window as conversation progresses. The pinning system re-injects key instructions at every safe boundary. **Drift escalation** automatically closes the gate when critical violations are detected, forcing re-declaration. The `/pin` command lets users pin instructions directly.

### Q4 — Default safety

Neither declared nor executed. No intervention needed.

### Design Philosophy: "Out of Control" and Distributed Safety

Azent's architecture draws inspiration from Kevin Kelly's *Out of Control* (1994), which argues that complex systems cannot be managed through centralized, top-down control. Instead, they require **distributed, bottom-up mechanisms** where order emerges from simple local rules.

| *Out of Control* Principle | Azent Implementation |
|---------------------------|---------------------|
| **Absence of centralized control** | No single component controls agent behavior; Zen gate, drift check, and pinning form a distributed safety net |
| **Autonomous subunits** | Each phase in Loop Mode runs as an independent sub-agent with its own boundary declaration |
| **High connectivity** | Zen context, experience memory, and pinned instructions flow between all components |
| **Webby nonlinear causality** | A drift violation in one phase cascades: escalate → close gate → force re-declaration → all downstream phases affected |
| **Subsumption architecture** (Brooks) | Q4 → Q2 → Q1 → Q3 layers stack without replacing lower layers; each adds guarantees on top of simpler ones |
| **Honor your errors** | `checkDrift` detects violations, `escalate` forces correction — mistakes become learning opportunities via Experience Store |
| **Grow by chunking** | Loop Mode composes phases like Brooks' behavioral layers: simple → complex, each layer reliable before adding the next |
| **Bottom-up control** | Auto-pinning extracts constraints from project context (AGENTS.md) — rules emerge from the codebase, not just from user commands |

The Zen Layer's insight is that **correctness cannot be ensured through vigilance** — any rule you can only enforce by remembering it will eventually be forgotten. Instead, correctness is built into the *structure* of the system: enforced software gates, pinned instructions that survive attention decay, and mandatory boundary declarations that make implicit assumptions testable.

### Academic Foundations

| Concept | Reference |
|---------|-----------|
| Working memory ~4 chunks | Cowan 2001 |
| Inattentional blindness | Simons & Chabris 1999 |
| Rapid decay without rehearsal | Peterson & Peterson 1959 |
| "Lost in the Middle" effect | Liu et al. 2023 |
| Bounded Cognition theory | [Shape of the System](https://shapeofthesystem.com/posts/2026/02/03/bounded-cognition) |
| Distributed systems / emergence | Kelly, *Out of Control* 1994 |
| Subsumption architecture | Brooks 1986 |
| Double-loop learning | Argyris & Schön 1978 |

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

## Design Assessment

### What Works Well

1. **Zen Gate + Boundary Declaration** — the software-enforced checkpoint before destructive actions is the system's strongest safety guarantee. It makes Q2 (implicit knowledge) visible and testable.

2. **Drift Escalation** — when critical pinned instructions are violated, the gate automatically closes. This creates a closed feedback loop: detect → escalate → correct.

3. **Pluggable Evaluation** — Loop Mode phases now support multiple evaluation strategies (keyword, regex, LLM, script, tool_output), making phase quality assessment adaptable to different task types.

4. **Experience Memory** — past task outcomes are searched (TF-IDF) and surfaced as `<zen_experience>` context, enabling the agent to learn from history.

5. **Auto-pinning** — CRITICAL/NEVER/MUST constraints from AGENTS.md are automatically pinned at session start, reducing manual configuration burden.

### Areas for Improvement

1. **LLM-based drift detection** (`checkDriftDeep`) — currently has no callers. The deep check would reduce false positives from the heuristic drift detection. Activation requires proper LLM infrastructure threading through the V2 session runner.

2. **DAG execution mode** — Loop phases currently run sequentially. The schema supports `dependsOn` for DAG-based execution, but the engine only implements `currentPhase++`. Implementing topological-sort-based scheduling would enable parallel phase execution.

3. **V2 session runner integration** — Zen Layer is fully integrated in the V1 path. The V2 runner has TODO markers and imports but no active Zen enforcement. Full V2 migration would unify the codebase.

4. **Phase-level tool permissions** — schema supports `toolPermissions: { allow: [...], deny: [...] }` per phase, but not yet enforced at the tool execution level.

5. **`/loop` command tool implementations** — the command template exists but `saveTemplate`/`loadTemplate`/`listTemplates`/`removeTemplate` need corresponding tool implementations for agents to invoke them programmatically.

6. **Experience Store embeddings** — TF-IDF search is an improvement over naive word frequency, but embedding-based semantic search would provide better relevance for complex queries.

### Is the Four-Quadrant Model Valuable?

**Yes.** The Q2/Q3 distinction captures a real and important problem in LLM-agent systems:

- **Q2** (implicit → explicit): Without boundary declaration, agents act on undocumented assumptions. Making these testable is the first line of defense.
- **Q3** (declared but forgotten): The "Lost in the Middle" effect is a well-documented LLM failure mode. Instruction pinning directly addresses this.
- **The Q2→Q1→Q3→Q1 state machine** provides a clear mental model for understanding agent reliability: safe → aware → compliant → alert → corrected.

The model's limitation is that Q1 (ideal state) and Q4 (default safe) are endpoints — they describe states but don't prescribe actions. The value is in the transitions: Q2→Q1 (boundary declaration) and Q3→Q1 (drift correction).

### Is Azent Usable?

Azent provides meaningful safety guarantees beyond vanilla LLM coding assistants. The Zen gate prevents destructive actions without explicit boundary declaration. Drift detection catches instruction violations mid-conversation. Auto-pinning extracts project constraints automatically.

However, the current UX requires agents to understand and invoke Zen tools (`zen_boundary`, `zen_pin`, `zen_aware`). A more seamless experience would:
- Auto-trigger `zen_boundary` on first destructive tool attempt (instead of blocking with an error)
- Surface drift alerts more prominently to users
- Provide a visual Zen status indicator in the TUI

### Comparison: Azent vs. Other Approaches

| Approach | Mechanism | Limitation |
|----------|-----------|------------|
| **Prompt engineering** (most tools) | "Always do X, never do Y" in system prompt | Fades from attention window (Q3) |
| **Guardrails / policy engines** | Pre/post-execution content filtering | Binary pass/fail, no structured recovery path |
| **Human-in-the-loop** | Manual approval for each action | Doesn't scale; human attention is also bounded |
| **Azent Zen Layer** | Structured boundary + pinning + drift + escalation | Requires model cooperation with Zen tools |

Azent's approach is distinctive: it doesn't try to control the agent. It creates *structural conditions* where correctness is more likely to emerge — a distributed safety net where gate, boundary, pins, and drift checks each provide independent guarantees that compose into a stronger whole. This is the "out of control" philosophy applied to AI safety: not "out of control" as chaos, but "out of centralized control" as distributed resilience.

## License

MIT — forked from [OpenCode](https://github.com/anomalyco/opencode)
