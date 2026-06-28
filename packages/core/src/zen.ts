import { Context, Effect, Layer, Schema } from "effect"
import { SessionSchema } from "./session/schema"

export const BoundaryDeclaration = Schema.Struct({
  understanding: Schema.String,
  assumptions: Schema.Array(Schema.String),
  implicitKnowledge: Schema.Array(Schema.Struct({
    domain: Schema.String,
    whatIKnow: Schema.String,
    source: Schema.Literal("training_data", "current_context", "project_analysis", "past_experience", "common_convention"),
    confidence: Schema.Literal("high", "medium", "low"),
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
  priority: Schema.Literal("critical", "high", "medium"),
  pinnedAt: Schema.Number,
  scope: Schema.Literal("session", "agent_turn"),
})

export const ZenAction = Schema.Struct({
  tool: Schema.String,
  pattern: Schema.String,
  context: Schema.String,
})

export const GateResult = Schema.Union(
  Schema.Struct({ type: Schema.Literal("allow") }),
  Schema.Struct({ type: Schema.Literal("block"), reason: Schema.String, requiredAction: Schema.String }),
  Schema.Struct({ type: Schema.Literal("clarify"), questions: Schema.Array(Schema.String) }),
  Schema.Struct({ type: Schema.Literal("warn"), reason: Schema.String }),
)

export interface ZenState {
  sessionID: string
  boundary?: typeof BoundaryDeclaration.Type
  pinnedInstructions: (typeof PinnedInstruction.Type)[]
  gateOpen: boolean
  confidenceLevel: "high" | "medium" | "low" | "unknown"
}

export interface Interface {
  readonly init: (sessionID: SessionSchema.ID) => Effect.Effect<void>
  readonly getState: (sessionID: SessionSchema.ID) => Effect.Effect<ZenState | undefined>

  readonly declareBoundary: (sessionID: SessionSchema.ID, declaration: typeof BoundaryDeclaration.Type) => Effect.Effect<void>

  readonly gate: (sessionID: SessionSchema.ID, action: typeof ZenAction.Type) => Effect.Effect<typeof GateResult.Type>

  readonly pin: (sessionID: SessionSchema.ID, instruction: typeof PinnedInstruction.Type) => Effect.Effect<void>
  readonly getActivePins: (sessionID: SessionSchema.ID) => Effect.Effect<(typeof PinnedInstruction.Type)[]>

  readonly reinjectPinnedInstructions: (sessionID: SessionSchema.ID) => Effect.Effect<string>

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
        const hasLowConfidence = declaration.implicitKnowledge.some((k) => k.confidence === "low")
        if (hasUncertainties || hasLowConfidence) {
          s.gateOpen = false
          s.confidenceLevel = "low"
        } else {
          s.gateOpen = true
          s.confidenceLevel = declaration.implicitKnowledge.every((k) => k.confidence === "high")
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
        parts.push("</zen_layer>")
        return parts.join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer

export * as Zen from "./zen"
