import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Zen } from "@azent/core/zen"

export const Parameters = Schema.Struct({
  whatIKnow: Schema.Array(Schema.Struct({
    domain: Schema.String,
    detail: Schema.String,
    confidence: Schema.Literals(["high", "medium", "low"]),
    source: Schema.Literals(["training_data", "codebase_analysis", "user_input", "past_experience", "convention"]),
  })),
  whatImUnsureAbout: Schema.Array(Schema.Struct({
    topic: Schema.String,
    why: Schema.String,
    suggestedQuestion: Schema.String,
  })),
})

export const ZenAwareTool = Tool.define(
  "zen_aware",
  Effect.gen(function* () {
    const zen = yield* Zen.ZenService
    return {
      description: `Use this tool to tell the user what you know and what you don't know about their context and the task at hand. This makes your knowledge boundaries transparent.

When to call this:
- At the start of plan mode, after you've gathered initial context
- When the user asks "what do you know about X?"
- Before making a significant decision based on implicit knowledge
- When you suspect the user is unsure what you understand

What to declare:
- whatIKnow: knowledge you're confident about, with source (training_data / codebase_analysis / user_input / past_experience / convention) and confidence level
- whatImUnsureAbout: topics you need clarification on, with suggested questions for the user`,

      parameters: Parameters,
      execute: (args, ctx) =>
        Effect.gen(function* () {
          const params = args as Schema.Schema.Type<typeof Parameters>
          yield* zen.updateCapabilities(ctx.sessionID, params.whatIKnow.map((k) => ({
            domain: k.domain,
            detail: k.detail,
            confidence: k.confidence,
            source: k.source,
          })))
          const known = params.whatIKnow.map(
            (k) => `  ✓ ${k.domain} (${k.confidence}, from ${k.source}): ${k.detail}`,
          )
          const unsure = params.whatImUnsureAbout.map(
            (u) => `  ✗ ${u.topic}: ${u.why} → ${u.suggestedQuestion}`,
          )

          const output = [
            "## Knowledge Boundary",
            "",
            "### What I know:",
            ...known,
            "",
            "### What I'm unsure about:",
            ...(unsure.length > 0 ? unsure : ["  (nothing — I have sufficient understanding)"]),
            "",
            params.whatImUnsureAbout.length > 0
              ? "ACTION: Use the question tool to ask the user about the topics marked ✗ before proceeding."
              : "All knowledge boundaries are clear. Proceed with confidence.",
          ].join("\n")

          return {
            title: `Knowledge boundary: ${params.whatIKnow.length} known, ${params.whatImUnsureAbout.length} unsure`,
            output,
            metadata: { knownCount: params.whatIKnow.length, unsureCount: params.whatImUnsureAbout.length },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
