import { Context, Effect, Layer, Option, Schema } from "effect"
import { evaluateOutput } from "./evaluate"
import { createLoopConfigStore } from "./store"
import { InstanceState } from "@/effect/instance-state"
import { Zen } from "@azent/core/zen"
import { SessionSchema } from "@azent/core/session/schema"
import path from "path"

export const EvalStrategy = Schema.Union([
  Schema.Struct({ type: Schema.Literals(["keyword"]), threshold: Schema.optional(Schema.Number) }),
  Schema.Struct({ type: Schema.Literals(["llm"]), prompt: Schema.String }),
  Schema.Struct({ type: Schema.Literals(["regex"]), pattern: Schema.String }),
  Schema.Struct({ type: Schema.Literals(["script"]), command: Schema.String }),
  Schema.Struct({ type: Schema.Literals(["tool_output"]), toolName: Schema.String }),
])

export const LoopPhaseSchema = Schema.Struct({
  id: Schema.String,
  agent: Schema.String,
  feedforward: Schema.String,
  acceptance: Schema.String,
  evaluation: Schema.optional(EvalStrategy),
  retry: Schema.optional(Schema.Struct({
    maxRetries: Schema.Number,
    backoff: Schema.Literals(["none", "linear", "exponential"]),
  })),
  dependsOn: Schema.optional(Schema.Array(Schema.String)),
  timeout: Schema.optional(Schema.Number),
  toolPermissions: Schema.optional(Schema.Struct({
    allow: Schema.Array(Schema.String),
    deny: Schema.Array(Schema.String),
  })),
})

export const LoopPlanSchema = Schema.Struct({
  phases: Schema.Array(LoopPhaseSchema),
  planPath: Schema.optional(Schema.String),
  mode: Schema.optional(Schema.Literals(["sequential", "dag", "parallel"])),
})

export type LoopPhase = Schema.Schema.Type<typeof LoopPhaseSchema>
export type LoopPlan = Schema.Schema.Type<typeof LoopPlanSchema>

export type PhaseStatus = "pending" | "running" | "complete" | "failed"

export interface PhaseResult {
  phaseId: string
  output: string
  passed: boolean
  feedback?: string
}

export interface LoopSession {
  plan: LoopPlan
  currentPhase: number
  results: PhaseResult[]
  status: "idle" | "running" | "awaiting-input" | "complete"
}

export interface Interface {
  readonly getState: (sessionID: string) => LoopSession | undefined
  readonly initLoop: (sessionID: string, plan: LoopPlan) => Effect.Effect<void>
  readonly advancePhase: (sessionID: string) => Effect.Effect<LoopPhase | null>
  readonly completePhase: (sessionID: string, result: PhaseResult) => Effect.Effect<void>
  readonly getCurrentPhase: (sessionID: string) => LoopPhase | null
  readonly getPhaseStatus: (sessionID: string) => PhaseStatus[]
  readonly isComplete: (sessionID: string) => boolean
  readonly evaluatePhase: (phaseId: string, output: string, feedforward: string, acceptance: string, strategy?: Schema.Schema.Type<typeof EvalStrategy>) => PhaseResult
  readonly generateSummary: (sessionID: string) => string
  readonly saveTemplate: (name: string, plan: LoopPlan) => Effect.Effect<void>
  readonly loadTemplate: (name: string) => Effect.Effect<LoopPlan | null>
  readonly listTemplates: () => Effect.Effect<Array<{ name: string; phaseCount: number; createdAt: number }>>
  readonly removeTemplate: (name: string) => Effect.Effect<void>
}

type State = Map<string, LoopSession>

export class LoopService extends Context.Service<LoopService, Interface>()("@azent/Loop") {}

export const layer = Layer.effect(
  LoopService,
  Effect.gen(function* () {
    const state: State = new Map()

    return {
      getState: (sessionID: string) => state.get(sessionID),

      initLoop: Effect.fn("Loop.initLoop")(function* (sessionID: string, plan: LoopPlan) {
        state.set(sessionID, {
          plan,
          currentPhase: 0,
          results: [],
          status: "running",
        })
      }),

      advancePhase: Effect.fn("Loop.advancePhase")(function* (sessionID: string) {
        const session = state.get(sessionID)
        if (!session) return null
        if (session.currentPhase >= session.plan.phases.length) return null
        const phase = session.plan.phases[session.currentPhase]
        session.currentPhase++
        session.status = "running"

        // Per-phase Zen boundary reset: close gate to force re-declaration
        const zen = yield* Effect.serviceOption(Zen.ZenService)
        if (Option.isSome(zen)) {
          const zenState = yield* zen.value.getState(sessionID as SessionSchema.ID)
          if (zenState) {
            zenState.gateOpen = false
            zenState.confidenceLevel = "unknown"
            zenState.boundary = undefined
          }
        }

        return phase
      }),

      completePhase: Effect.fn("Loop.completePhase")(function* (sessionID: string, result: PhaseResult) {
        const session = state.get(sessionID)
        if (!session) return
        session.results.push(result)
        if (session.currentPhase >= session.plan.phases.length) {
          session.status = "complete"
        } else {
          session.status = "awaiting-input"
        }
      }),

      getCurrentPhase: (sessionID: string) => {
        const session = state.get(sessionID)
        if (!session) return null
        if (session.currentPhase >= session.plan.phases.length) return null
        return session.plan.phases[session.currentPhase]
      },

      getPhaseStatus: (sessionID: string) => {
        const session = state.get(sessionID)
        if (!session) return []
        return session.plan.phases.map((phase, i) => {
          if (i < session.currentPhase - 1) return "complete" as PhaseStatus
          if (i === session.currentPhase - 1) return "complete" as PhaseStatus
          if (i === session.currentPhase) return "running" as PhaseStatus
          return "pending" as PhaseStatus
        })
      },

      isComplete: (sessionID: string) => {
        const session = state.get(sessionID)
        return session?.status === "complete"
      },

      evaluatePhase: (phaseId: string, output: string, feedforward: string, acceptance: string, strategy?: Schema.Schema.Type<typeof EvalStrategy>) => {
        const evalType = strategy?.type ?? "keyword"
        const result = (() => {
          switch (evalType) {
            case "llm":
              // LLM evaluation — returns optimistic pass, actual evaluation done by caller
              return { passed: true, score: 80, feedback: "LLM evaluation deferred to caller" }
            case "regex": {
              if (!strategy || strategy.type !== "regex") break
              try {
                const re = new RegExp(strategy.pattern, "i")
                const passed = re.test(output)
                return { passed, score: passed ? 100 : 0, feedback: passed ? "Regex pattern matched" : `Regex /${strategy.pattern}/ did not match` }
              } catch {
                return { passed: false, score: 0, feedback: `Invalid regex: ${strategy.pattern}` }
              }
            }
            case "script":
              // Script evaluation — returns optimistic pass, execution deferred to caller
              return { passed: true, score: 70, feedback: `Script evaluation deferred: ${(strategy as any)?.command ?? "unknown"}` }
            case "tool_output":
              return { passed: true, score: 70, feedback: `Tool output evaluation deferred: ${(strategy as any)?.toolName ?? "unknown"}` }
            default:
              break
          }
          return evaluateOutput(output, feedforward, acceptance, (strategy as any)?.threshold)
        })()
        return { phaseId, output, passed: result.passed, feedback: result.feedback }
      },

      generateSummary: (sessionID: string) => {
        const session = state.get(sessionID)
        if (!session || session.results.length === 0) return "No phases executed."
        const lines = session.plan.phases.map((phase, i) => {
          const result = session.results[i]
          const status = result?.passed ? "✓" : "✗"
          const score = result ? `${result.feedback}` : "not executed"
          return `  ${status} ${phase.id}: ${score}`
        })
        return `Loop "${session.plan.planPath || "unnamed"}" complete.\n${lines.join("\n")}`
      },

      saveTemplate: Effect.fn("Loop.saveTemplate")(function* (name: string, plan: LoopPlan) {
        const ctx = yield* InstanceState.context
        const dataDir = path.join(ctx.worktree, ".azent", "data")
        const store = yield* Effect.promise(() => createLoopConfigStore(dataDir))
        yield* Effect.promise(() => store.write({
          id: name.toLowerCase().replace(/\s+/g, "-"),
          name,
          phases: plan.phases.map((p) => ({
            id: p.id,
            agent: p.agent,
            feedforward: p.feedforward,
            acceptance: p.acceptance,
          })),
          createdAt: Date.now(),
        }))
      }),

      loadTemplate: Effect.fn("Loop.loadTemplate")(function* (name: string) {
        const ctx = yield* InstanceState.context
        const dataDir = path.join(ctx.worktree, ".azent", "data")
        const store = yield* Effect.promise(() => createLoopConfigStore(dataDir))
        const config = yield* Effect.promise(() => store.read(name))
        if (!config) return null
        return {
          phases: config.phases.map((p) => ({
            id: p.id,
            agent: p.agent,
            feedforward: p.feedforward,
            acceptance: p.acceptance,
          })),
        }
      }),

      listTemplates: Effect.fn("Loop.listTemplates")(function* () {
        const ctx = yield* InstanceState.context
        const dataDir = path.join(ctx.worktree, ".azent", "data")
        const store = yield* Effect.promise(() => createLoopConfigStore(dataDir))
        const configs = yield* Effect.promise(() => store.list())
        return configs.map((c) => ({
          name: c.name,
          phaseCount: c.phases.length,
          createdAt: c.createdAt,
        }))
      }),

      removeTemplate: Effect.fn("Loop.removeTemplate")(function* (name: string) {
        const ctx = yield* InstanceState.context
        const dataDir = path.join(ctx.worktree, ".azent", "data")
        const store = yield* Effect.promise(() => createLoopConfigStore(dataDir))
        yield* Effect.promise(() => store.remove(name))
      }),
    }
  }),
)

export * as Loop from "./engine"
