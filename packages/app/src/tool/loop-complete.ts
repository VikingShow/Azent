import { Effect, Option, Schema } from "effect"
import * as Tool from "./tool"
import { LoopService, type LoopPhase } from "../session/loop/engine"
import { Experience } from "../experience/store"

export const Parameters = Schema.Struct({
  phaseId: Schema.String,
  output: Schema.String,
})

export const LoopCompleteTool = Tool.define(
  "loop_complete",
  Effect.gen(function* () {
    const loop = yield* LoopService
    const exp = yield* Effect.serviceOption(Experience.ExperienceService)

    return {
      description: `Call this tool when you have completed a loop phase and want the system to evaluate the output.

After evaluation:
- If passed: the system will present results and ask user for confirmation to proceed
- If failed: you will receive feedback and should retry with improvements`,

      parameters: Parameters,
      execute: (args, ctx) =>
        Effect.gen(function* () {
          const params = args as Schema.Schema.Type<typeof Parameters>
          const currentPhase = loop.getCurrentPhase(ctx.sessionID)
          if (!currentPhase) {
            return {
              title: "No active phase",
              output: "No active loop phase found. The loop may have already completed.",
              metadata: {},
            }
          }

          const result = loop.evaluatePhase(
            params.phaseId,
            params.output,
            currentPhase.feedforward,
            currentPhase.acceptance,
            (currentPhase as LoopPhase).evaluation,
          )

          yield* loop.completePhase(ctx.sessionID, {
            phaseId: params.phaseId,
            output: params.output,
            passed: result.passed,
            feedback: result.feedback,
          })

          if (Option.isSome(exp)) {
            yield* Effect.promise(() => exp.value.record({
              feedforward: currentPhase.feedforward,
              output: params.output,
              problem: result.passed ? undefined : result.feedback,
              solution: result.passed ? params.output : undefined,
              verified: result.passed,
              projectId: "azent",
            })).pipe(Effect.ignore)
          }

          const nextPhase = loop.getCurrentPhase(ctx.sessionID)
          const allComplete = loop.isComplete(ctx.sessionID)

          if (allComplete) {
            const summary = loop.generateSummary(ctx.sessionID)
            return {
              title: `All phases complete`,
              output: `${result.passed ? "✓ Phase passed" : "✗ Phase failed"}: ${result.feedback}\n\n${summary}\n\nAll phases have been completed. The loop is finished.`,
              metadata: { passed: result.passed, complete: true },
            }
          }

          return {
            title: `Phase ${params.phaseId} ${result.passed ? "passed" : "failed"}`,
            output: `${result.passed ? "✓" : "✗"} ${result.feedback}\n\n${nextPhase ? `Next phase: ${nextPhase.id}` : "No more phases"}`,
            metadata: { passed: result.passed, nextPhase: nextPhase?.id },
          }
        }).pipe(Effect.orDie),
    } as Tool.DefWithoutID<typeof Parameters, any>
  }),
)
