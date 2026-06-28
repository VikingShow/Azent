import { Context, Effect, Layer, Schema } from "effect"
import { evaluateOutput } from "./evaluate"

export const LoopPhaseSchema = Schema.Struct({
  id: Schema.String,
  agent: Schema.String,
  feedforward: Schema.String,
  acceptance: Schema.String,
})

export const LoopPlanSchema = Schema.Struct({
  phases: Schema.Array(LoopPhaseSchema),
  planPath: Schema.optional(Schema.String),
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
  readonly evaluatePhase: (phaseId: string, output: string, feedforward: string, acceptance: string) => PhaseResult
  readonly generateSummary: (sessionID: string) => string
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

      evaluatePhase: (phaseId: string, output: string, feedforward: string, acceptance: string) => {
        const result = evaluateOutput(output, feedforward, acceptance)
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
    }
  }),
)
