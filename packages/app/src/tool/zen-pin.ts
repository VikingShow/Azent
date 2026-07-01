import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Zen } from "@azent/core/zen"

export const Parameters = Schema.Struct({
  instructions: Schema.Array(Schema.Struct({
    content: Schema.String,
    priority: Schema.Literals(["critical", "high", "medium"]),
    scope: Schema.Literals(["session", "agent_turn"]),
  })),
})

export const ZenPinTool = Tool.define(
  "zen_pin",
  Effect.gen(function* () {
    const zen = yield* Zen.ZenService

    return {
      description: `Pin critical instructions so they survive context dilution (Q3 anti-drift protection).

During long conversations, important instructions get "lost in the middle" of the LLM's attention window. Use this tool to pin instructions that MUST be followed throughout the session.

Pinned instructions are:
- Re-injected at every safe boundary (before each agent turn)
- Checked for violations via drift detection after each assistant turn
- Sorted by priority (critical first) in context

When to use:
- User explicitly says "remember this" or "never do X"
- You discover a project convention that must be respected
- A critical constraint emerges mid-conversation
- After the user corrects you — pin the correction

Priority levels:
- critical: Must never be violated. Violation = immediate drift alert.
- high: Very important, check for compliance.
- medium: Good practice, worth remembering.`,

      parameters: Parameters,
      execute: (args, ctx) =>
        Effect.gen(function* () {
          const params = args as Schema.Schema.Type<typeof Parameters>
          for (const inst of params.instructions) {
            yield* zen.pin(ctx.sessionID, {
              id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              content: inst.content,
              priority: inst.priority,
              pinnedAt: Date.now(),
              scope: inst.scope,
            })
          }

          const active = yield* zen.getActivePins(ctx.sessionID)

          return {
            title: `${params.instructions.length} instruction(s) pinned`,
            output: [
              `${params.instructions.length} instruction(s) pinned successfully.`,
              "",
              `Active pins (${active.length} total):`,
              ...active.map((p, i) => `  ${i + 1}. [${p.priority.toUpperCase()}] ${p.content}`),
              "",
              "These instructions will now be re-injected at every safe boundary to prevent context drift.",
            ].join("\n"),
            metadata: {
              pinCount: params.instructions.length,
              totalPins: active.length,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
