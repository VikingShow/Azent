import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Zen } from "@azent/core/zen"

export const Parameters = Schema.Struct({
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

export const ZenBoundaryTool = Tool.define(
  "zen_boundary",
  Effect.gen(function* () {
    const zen = yield* Zen.ZenService

    return {
      description: `Use this tool to declare your understanding, assumptions, and plan BEFORE making file changes or running commands.

This is REQUIRED before using destructive tools: edit, write, bash, apply_patch, shell.

Protocol:
1. State what you understand the task to be
2. List your explicit assumptions
3. Identify implicit knowledge sources and their confidence level
4. Describe your plan
5. Mark unknowns that need user clarification

After calling this, the system will:
- Record your boundary declaration
- Open the action gate if confidence is sufficient
- Ask clarifying questions if needed`,

      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          yield* zen.declareBoundary(ctx.sessionID, params)

          const hasUncertainties = params.unknowns.length > 0
          const hasLowConfidence = params.implicitKnowledge.some((k) => k.confidence === "low")

          if (hasUncertainties || hasLowConfidence) {
            const questions = params.unknowns.map((u) => u.suggestedQuestion)
            return {
              title: "Boundary declared — clarifications needed",
              output: `Boundary recorded. However, the following need clarification:\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nPlease use the question tool to ask the user before proceeding.`,
              metadata: { gateOpen: false },
            }
          }

          return {
            title: "Boundary declared — gate open",
            output: `Understanding confirmed: ${params.understanding}\n\nAssumptions: ${params.assumptions.map((a) => `- ${a}`).join("\n")}\n\nPlan: ${params.plan}\n\nGate is now open. You may execute.`,
            metadata: { gateOpen: true },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
