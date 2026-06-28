/**
 * Zen Layer — Engineering for Bounded Cognition
 *
 * The fundamental constraint of software engineering is that the mind that
 * changes the system is always far smaller than the system itself. Humans hold
 * ~4 working memory slots; LLMs suffer the same attention dilution ("Lost in
 * the Middle"). No bigger model or smarter engineer closes this gap — it's the
 * permanent condition of the work.
 *
 * The Zen Layer externalizes cognitive load from the agent (and human) into
 * the *shape* of the system, implementing three core protocols:
 *
 * Q2 — Boundary Declaration (Implicit → Explicit):
 *   Surfaces tacit knowledge the agent draws from training data, project
 *   context, or convention. Before any destructive action, the agent must
 *   declare *what it assumes*, *where that knowledge came from*, and *how
 *   confident it is*. This transforms invisible assumptions into testable
 *   declarations. Tenets: I (Locality), III (Parse, don't validate).
 *
 * Q3 — Instruction Pinning (Anti-Drift):
 *   Critical instructions fade from the LLM's attention window as conversation
 *   progresses — the "Lost in the Middle" effect. Pinned instructions are
 *   re-injected at every safe boundary, ensuring they survive context dilution.
 *   Tenets: XIV (One source of truth), II (Make data flow explicit).
 *
 * Gate — Correctness into Structure:
 *   Any rule you can only enforce by remembering it will eventually be
 *   forgotten. The gate is a software-enforced checkpoint: no destructive tool
 *   executes until the boundary is declared and confidence is sufficient.
 *   Tenets: IV (Trust boundary), III (Parse, don't validate).
 *
 * The objective: minimise what a tired engineer (or a context-diluted model)
 * has to hold in their head to make a correct change, while keeping the blast
 * radius bounded for anything an attacker or an unlucky caller controls.
 *
 * @see https://shapeofthesystem.com/posts/2026/02/03/bounded-cognition
 */
import { Context, Effect, Layer, Schema } from "effect"
import { SessionSchema } from "./session/schema"

export const BoundaryDeclaration = Schema.Struct({
  understanding: Schema.String,
  assumptions: Schema.Array(Schema.String),
  implicitKnowledge: Schema.Array(Schema.Struct({
    domain: Schema.String,
    whatIKnow: Schema.String,
    source: Schema.Literals([
      "training_data",
      "current_context",
      "project_analysis",
      "past_experience",
      "common_convention",
    ]),
    confidence: Schema.Literals(["high", "medium", "low"]),
  })),
  plan: Schema.String,
  unknowns: Schema.Array(Schema.Struct({
    topic: Schema.String,
    whyImportant: Schema.String,
    suggestedQuestion: Schema.String,
  })),
})

export const PinnedInstruction = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  priority: Schema.Literals(["critical", "high", "medium"]),
  pinnedAt: Schema.Number,
  scope: Schema.Literals(["session", "agent_turn"]),
})

export const ZenAction = Schema.Struct({
  tool: Schema.String,
  pattern: Schema.String,
  context: Schema.String,
})

export const GateResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("allow") }),
  Schema.Struct({ type: Schema.Literal("block"), reason: Schema.String, requiredAction: Schema.String }),
  Schema.Struct({ type: Schema.Literal("clarify"), questions: Schema.Array(Schema.String) }),
  Schema.Struct({ type: Schema.Literal("warn"), reason: Schema.String }),
]).pipe(Schema.toTaggedUnion("type"))

export const DriftReport = Schema.Struct({
  driftDetected: Schema.Boolean,
  violatedInstructions: Schema.Array(Schema.Struct({
    instruction: Schema.String,
    violation: Schema.String,
    possibleCause: Schema.Literals(["context_window_overflow", "attention_dilution", "instruction_conflict", "mid_conversation_override"]),
  })),
  suggestedFix: Schema.String,
})

export interface ZenState {
  sessionID: string
  boundary?: typeof BoundaryDeclaration.Type
  pinnedInstructions: (typeof PinnedInstruction.Type)[]
  gateOpen: boolean
  confidenceLevel: "high" | "medium" | "low" | "unknown"
  declaredCapabilities: Array<{
    domain: string
    detail: string
    confidence: "high" | "medium" | "low"
    source: "training_data" | "codebase_analysis" | "user_input" | "past_experience" | "convention"
    declaredAt: number
  }>
}

export interface Interface {
  readonly init: (sessionID: SessionSchema.ID) => Effect.Effect<void>
  readonly getState: (sessionID: SessionSchema.ID) => Effect.Effect<ZenState | undefined>

  readonly declareBoundary: (sessionID: SessionSchema.ID, declaration: typeof BoundaryDeclaration.Type) => Effect.Effect<void>

  readonly gate: (sessionID: SessionSchema.ID, action: typeof ZenAction.Type) => Effect.Effect<typeof GateResult.Type>

  readonly pin: (sessionID: SessionSchema.ID, instruction: typeof PinnedInstruction.Type) => Effect.Effect<void>
  readonly getActivePins: (sessionID: SessionSchema.ID) => Effect.Effect<(typeof PinnedInstruction.Type)[]>

  readonly checkDrift: (sessionID: SessionSchema.ID, lastOutput: string) => Effect.Effect<typeof DriftReport.Type>

  readonly checkDriftDeep: (
    sessionID: SessionSchema.ID,
    lastOutput: string,
    evaluate: (prompt: string) => Effect.Effect<string>,
  ) => Effect.Effect<typeof DriftReport.Type>

  readonly reinjectPinnedInstructions: (sessionID: SessionSchema.ID) => Effect.Effect<string>

  readonly updateCapabilities: (
    sessionID: SessionSchema.ID,
    declared: Array<{
      domain: string
      detail: string
      confidence: "high" | "medium" | "low"
      source: "training_data" | "codebase_analysis" | "user_input" | "past_experience" | "convention"
    }>,
  ) => Effect.Effect<void>

  readonly getCapabilities: (sessionID: SessionSchema.ID) => Effect.Effect<typeof ZenState.prototype.declaredCapabilities>

  readonly renderContext: (sessionID: SessionSchema.ID) => Effect.Effect<string>
}

type State = Map<string, ZenState>

export class ZenService extends Context.Service<ZenService, Interface>()("@azent/Zen") {}

export const layer = Layer.effect(
  ZenService,
  Effect.gen(function* () {
    const state: State = new Map()

    return ZenService.of({
      init: Effect.fn("Zen.init")(function* (sessionID: SessionSchema.ID) {
        state.set(sessionID, {
          sessionID,
          pinnedInstructions: [],
          gateOpen: false,
          confidenceLevel: "unknown",
          declaredCapabilities: [],
        })
      }),

      getState: Effect.fnUntraced(function* (sessionID: SessionSchema.ID) {
        return state.get(sessionID)
      }),

      declareBoundary: Effect.fn("Zen.declareBoundary")(function* (
        sessionID: SessionSchema.ID,
        declaration: typeof BoundaryDeclaration.Type,
      ) {
        const s = state.get(sessionID)
        if (!s) return
        s.boundary = declaration
        const hasUncertainties = declaration.unknowns.length > 0
        const hasLowConfidence = declaration.implicitKnowledge.some(
          (k) => k.confidence === "low",
        )
        if (hasUncertainties || hasLowConfidence) {
          s.gateOpen = false
          s.confidenceLevel = "low"
        } else {
          s.gateOpen = true
          s.confidenceLevel = declaration.implicitKnowledge.every(
            (k) => k.confidence === "high",
          )
            ? "high"
            : "medium"
        }
      }),

      gate: Effect.fn("Zen.gate")(function* (sessionID: SessionSchema.ID, action: typeof ZenAction.Type) {
        const s = state.get(sessionID)
        if (!s) return { type: "block", reason: "Zen not initialized", requiredAction: "Initialize Zen session first" } as const

        if (s.gateOpen) return { type: "allow" } as const

        if (!s.boundary) {
          return {
            type: "block",
            reason: "No boundary declared. You are operating on implicit assumptions (Q2).",
            requiredAction: "Call zen_boundary to declare your understanding, assumptions, and plan before executing destructive actions.",
          } as const
        }

        if (s.confidenceLevel === "low") {
          const questions = s.boundary.unknowns.map((u) => u.suggestedQuestion)
          return { type: "clarify", questions } as const
        }

        const conflictingPins = s.pinnedInstructions.filter((p) =>
          p.content.toLowerCase().includes(action.tool.toLowerCase())
        )
        if (conflictingPins.length > 0) {
          return { type: "warn", reason: `May conflict with pinned instructions: ${conflictingPins.map((p) => p.content).join("; ")}` } as const
        }

        return { type: "allow" } as const
      }),

      pin: Effect.fn("Zen.pin")(function* (sessionID: SessionSchema.ID, instruction: typeof PinnedInstruction.Type) {
        const s = state.get(sessionID)
        if (!s) return
        s.pinnedInstructions.push(instruction)
      }),

      getActivePins: Effect.fnUntraced(function* (sessionID: SessionSchema.ID) {
        return state.get(sessionID)?.pinnedInstructions ?? []
      }),

      checkDrift: Effect.fn("Zen.checkDrift")(function* (sessionID: SessionSchema.ID, lastOutput: string) {
        const s = state.get(sessionID)
        const violated: typeof DriftReport.Type["violatedInstructions"] = []

        if (!s || s.pinnedInstructions.length === 0 || !lastOutput) {
          return { driftDetected: false, violatedInstructions: [], suggestedFix: "" }
        }

        const outputLower = lastOutput.toLowerCase()

        for (const pin of s.pinnedInstructions) {
          const contentLower = pin.content.toLowerCase()

          const negations = extractNegationTerms(pin.content)
          for (const neg of negations) {
            const negLower = neg.toLowerCase()
            if (outputLower.includes(negLower)) {
              violated.push({
                instruction: pin.content,
                violation: `Output appears to use "${neg}" which was explicitly prohibited`,
                possibleCause: "attention_dilution",
              })
              break
            }
          }

          if (pin.priority === "critical") {
            const keyTerms = extractKeyTerms(pin.content)
            const missing = keyTerms.filter((t) => !outputLower.includes(t.toLowerCase()))
            if (missing.length >= keyTerms.length * 0.5 && keyTerms.length > 0 && !violated.some((v) => v.instruction === pin.content)) {
              violated.push({
                instruction: pin.content,
                violation: `Output may be missing compliance with: ${missing.join(", ")}`,
                possibleCause: "context_window_overflow",
              })
            }
          }
        }

        const driftDetected = violated.length > 0
        return {
          driftDetected,
          violatedInstructions: violated,
          suggestedFix: driftDetected
            ? `The following pinned instructions may have been violated. Re-read them and adjust your output:\n${violated.map((v) => `- ${v.instruction}: ${v.violation}`).join("\n")}`
            : "",
        }
      }),

      checkDriftDeep: Effect.fn("Zen.checkDriftDeep")(function* (
        sessionID: SessionSchema.ID,
        lastOutput: string,
        evaluate: (prompt: string) => Effect.Effect<string>,
      ) {
        const s = state.get(sessionID)
        if (!s || s.pinnedInstructions.length === 0 || !lastOutput) {
          return { driftDetected: false, violatedInstructions: [], suggestedFix: "" }
        }

        const pinsText = s.pinnedInstructions
          .map((p) => `[${p.priority.toUpperCase()}] ${p.content}`)
          .join("\n")

        const prompt = [
          "You are an impartial instruction-compliance auditor. Check if the agent's output violates any pinned instructions.",
          "",
          "PINNED INSTRUCTIONS (must not be violated):",
          pinsText,
          "",
          "AGENT OUTPUT:",
          lastOutput.slice(0, 2000),
          "",
          "Return your answer as JSON:",
          '{',
          '  "driftDetected": true or false,',
          '  "violatedInstructions": [',
          '    {',
          '      "instruction": "the violated instruction text",',
          '      "violation": "specific description of what was violated",',
          '      "possibleCause": "context_window_overflow" | "attention_dilution" | "instruction_conflict" | "mid_conversation_override"',
          '    }',
          '  ],',
          '  "suggestedFix": "specific, actionable fix. Empty if no drift detected."',
          '}',
        ].join("\n")

        try {
          const response = yield* evaluate(prompt)
          const text = response.trim()
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            return {
              driftDetected: Boolean(parsed.driftDetected),
              violatedInstructions: Array.isArray(parsed.violatedInstructions)
                ? parsed.violatedInstructions.map((v: any) => ({
                    instruction: v.instruction ?? "",
                    violation: v.violation ?? "",
                    possibleCause: v.possibleCause ?? "attention_dilution",
                  }))
                : [],
              suggestedFix: parsed.suggestedFix ?? "",
            }
          }
        } catch {
          // Fall through to heuristic check
        }

        return yield* ZenService.checkDrift(sessionID, lastOutput).pipe(
          Effect.provideService(ZenService, ZenService.of(state as any)),
        )
      }),

      reinjectPinnedInstructions: Effect.fn("Zen.reinject")(function* (sessionID: SessionSchema.ID) {
        const s = state.get(sessionID)
        if (!s || s.pinnedInstructions.length === 0) return ""
        const active = [...s.pinnedInstructions].sort((a, b) => {
          const order = { critical: 0, high: 1, medium: 2 } as const
          return order[a.priority] - order[b.priority]
        })
        return [
          "<zen_pinned>",
          "The following instructions MUST be followed. They have been pinned to prevent context drift (Q3 protection):",
          ...active.map((p) => `[${p.priority.toUpperCase()}] ${p.content}`),
          "</zen_pinned>",
        ].join("\n")
      }),

      updateCapabilities: Effect.fn("Zen.updateCapabilities")(function* (
        sessionID: SessionSchema.ID,
        declared: Array<{
          domain: string
          detail: string
          confidence: "high" | "medium" | "low"
          source: "training_data" | "codebase_analysis" | "user_input" | "past_experience" | "convention"
        }>,
      ) {
        const s = state.get(sessionID)
        if (!s) return
        const now = Date.now()
        s.declaredCapabilities = declared.map((d) => ({ ...d, declaredAt: now }))
      }),

      getCapabilities: Effect.fnUntraced(function* (sessionID: SessionSchema.ID) {
        return state.get(sessionID)?.declaredCapabilities ?? []
      }),

      renderContext: Effect.fn("Zen.renderContext")(function* (sessionID: SessionSchema.ID) {
        const s = state.get(sessionID)
        if (!s) return ""
        const parts: string[] = ["<zen_layer>"]
        parts.push(`Gate: ${s.gateOpen ? "OPEN" : "CLOSED"}`)
        if (!s.gateOpen) {
          parts.push("ACTION REQUIRED: Declare your boundary before executing destructive tools (edit/write/bash).")
        }
        if (s.boundary) {
          parts.push(`Understanding: ${s.boundary.understanding.slice(0, 200)}`)
          if (s.boundary.implicitKnowledge.length > 0) {
            parts.push("Implicit knowledge sources:")
            for (const k of s.boundary.implicitKnowledge) {
              parts.push(`  - ${k.domain}: "${k.whatIKnow}" (source: ${k.source}, confidence: ${k.confidence})`)
            }
          }
          if (s.boundary.unknowns.length > 0) {
            parts.push("Uncertainties:")
            for (const u of s.boundary.unknowns) {
              parts.push(`  - ${u.topic}: ${u.suggestedQuestion}`)
            }
          }
        }
        if (s.pinnedInstructions.length > 0) {
          const active = [...s.pinnedInstructions].sort((a, b) => {
            const order = { critical: 0, high: 1, medium: 2 } as const
            return order[a.priority] - order[b.priority]
          })
          parts.push("<zen_pinned>The following MUST be followed (Q3 protection):")
          for (const p of active) {
            parts.push(`[${p.priority.toUpperCase()}] ${p.content}`)
          }
          parts.push("</zen_pinned>")
        }
        if (s.declaredCapabilities.length > 0) {
          parts.push("<zen_capabilities>")
          parts.push("Agent-declared capabilities (via zen_aware):")
          for (const c of s.declaredCapabilities) {
            parts.push(`  ${c.confidence === "high" ? "✓" : c.confidence === "medium" ? "~" : "✗"} ${c.domain} (${c.confidence}, from ${c.source}): ${c.detail}`)
          }
          parts.push("When user asks about your capabilities, report from this list. Use zen_aware to update it as you learn.")
          parts.push("</zen_capabilities>")
        }
        parts.push("</zen_layer>")
        return parts.join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer

const NEGATION_PATTERNS = [
  "do not", "don't", "never", "must not", "should not", "shouldn't",
  "avoid", "forbidden", "prohibited", "without exception", "under no circumstances",
]

function extractNegationTerms(instruction: string): string[] {
  const lower = instruction.toLowerCase()
  const terms: string[] = []
  for (const pattern of NEGATION_PATTERNS) {
    const idx = lower.indexOf(pattern)
    if (idx >= 0) {
      const after = instruction.slice(idx + pattern.length).trim()
      const end = Math.min(after.length, 80)
      const snippet = after.slice(0, end).replace(/[.,;!?].*/, "").trim()
      if (snippet.length > 2) terms.push(snippet)
    }
  }
  return terms
}

function extractKeyTerms(instruction: string): string[] {
  return instruction
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["that", "this", "with", "from", "your", "have", "will", "when", "make", "they", "them", "then", "than", "also", "just", "only", "very", "much", "such", "must", "should", "never"].includes(w))
}

export * as Zen from "./zen"
