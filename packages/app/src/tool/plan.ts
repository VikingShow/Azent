import path from "path"
import { SessionV1 } from "@azent/core/v1/session"
import { Effect, Option, Schema } from "effect"
import * as Tool from "./tool"
import { Question } from "../question"
import { Session } from "@/session/session"
import { MessageV2 } from "../session/message-v2"
import { Provider } from "@/provider/provider"
import { InstanceState } from "@/effect/instance-state"
import { MessageID, PartID } from "../session/schema"
import { LoopService } from "../session/loop/engine"
import { Zen } from "@azent/core/zen"
import EXIT_DESCRIPTION from "./plan-exit.txt"

const LoopPhaseSchema = Schema.Struct({
  id: Schema.String,
  agent: Schema.String,
  feedforward: Schema.String,
  acceptance: Schema.String,
})

const LoopTemplateSchema = Schema.Struct({
  phases: Schema.Array(LoopPhaseSchema),
})

export const Parameters = Schema.Struct({
  mode: Schema.Literal("build", "loop"),
  loopTemplate: Schema.optional(LoopTemplateSchema),
})

export const PlanExitTool = Tool.define(
  "plan_exit",
  Effect.gen(function* () {
    const session = yield* Session.Service
    const question = yield* Question.Service
    const provider = yield* Provider.Service
    const loop = yield* LoopService
    const zen = yield* Effect.serviceOption(Zen.ZenService)

    return {
      description: EXIT_DESCRIPTION,
      parameters: Parameters,
      execute: (params: { mode: string; loopTemplate?: { phases: Array<{ id: string; agent: string; feedforward: string; acceptance: string }> } }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const info = yield* session.get(ctx.sessionID)
          const planPath = path.relative(instance.worktree, Session.plan(info, instance))

          const options = []
          const isLoop = params.mode === "loop" && params.loopTemplate

          if (isLoop) {
            const phases = params.loopTemplate!.phases.map((p) => p.id).join(" → ")
            options.push(
              { label: `Loop`, description: `Multi-phase orchestration: ${phases}` },
              { label: "Build", description: "Single agent execution" },
              { label: "Edit", description: "Stay in plan mode to refine" },
            )
          } else {
            options.push(
              { label: "Build", description: "Switch to build agent and start implementing" },
              { label: "Edit", description: "Stay in plan mode to refine the plan" },
            )
          }

          const answers = yield* question.ask({
            sessionID: ctx.sessionID,
            questions: [
              {
                question: isLoop
                  ? `Plan at ${planPath} is complete. How would you like to proceed?`
                  : `Plan at ${planPath} is complete. Would you like to switch to build agent?`,
                header: "Execute Plan",
                custom: false,
                options,
              },
            ],
            tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
          })

          const choice = answers[0]?.[0]
          if (choice === "Edit") yield* new Question.RejectedError()

          const hasBoundary = Option.isSome(zen)
            ? (yield* zen.value.getState(ctx.sessionID))?.boundary !== undefined
            : true

          if (!hasBoundary) {
            return {
              title: "Boundary not declared",
              output: [
                "Before switching to build or loop mode, you should call `zen_boundary` to declare:",
                "- Your understanding of the task",
                "- Your assumptions",
                "- Your implicit knowledge sources and confidence levels",
                "- Any unknowns that need clarification",
                "",
                "If you believe your plan is complete and boundary is implicit, say 'proceed' and the user will be asked again.",
              ].join("\n"),
              metadata: { boundaryMissing: true },
            }
          }

          const isBuild = choice === "Build" || (!isLoop && choice === "Yes")
          const targetAgent = isBuild ? "build" : "supervisor"

          const messages = yield* session.messages({ sessionID: ctx.sessionID }).pipe(Effect.orDie)
          const lastUser = messages.findLast((item) => item.info.role === "user" && item.info.model)
          const model =
            lastUser?.info.role === "user" && lastUser.info.model ? lastUser.info.model : yield* provider.defaultModel()

          const msg: SessionV1.User = {
            id: MessageID.ascending(),
            sessionID: ctx.sessionID,
            role: "user",
            time: { created: Date.now() },
            agent: targetAgent,
            model,
          }
          yield* session.updateMessage(msg)

          if (isBuild) {
            yield* session.updatePart({
              id: PartID.ascending(),
              messageID: msg.id,
              sessionID: ctx.sessionID,
              type: "text",
              text: `The plan at ${planPath} has been approved, you can now edit files. Execute the plan`,
              synthetic: true,
            } satisfies SessionV1.TextPart)
          } else {
            const loopPlan = {
              phases: params.loopTemplate!.phases,
              planPath,
            }
            yield* loop.initLoop(ctx.sessionID, loopPlan)
            const phasesDesc = params.loopTemplate!.phases.map((p) => `  ${p.id} (${p.agent}): ${p.feedforward}`).join("\n")
            yield* session.updatePart({
              id: PartID.ascending(),
              messageID: msg.id,
              sessionID: ctx.sessionID,
              type: "text",
              text: `Starting loop mode with phases:\n${phasesDesc}\n\nPlan: ${planPath}`,
              synthetic: true,
            } satisfies SessionV1.TextPart)
          }

          const label = isBuild ? "build" : "loop"
          return {
            title: `Switching to ${label} agent`,
            output: `User approved switching to ${label} agent. Wait for further instructions.`,
            metadata: {},
          }
        }).pipe(Effect.orDie),
    }
  }),
)
