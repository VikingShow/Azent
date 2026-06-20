import { Schema } from "effect"

export const ConfigPhase = Schema.Struct({
  id: Schema.String,
  agent: Schema.String,
  feedforward: Schema.String,
  acceptance: Schema.String,
})

export const ConfigLoop = Schema.Struct({
  name: Schema.String,
  phases: Schema.Array(ConfigPhase),
})

export type PhaseConfig = Schema.Schema.Type<typeof ConfigPhase>
export type LoopConfig = Schema.Schema.Type<typeof ConfigLoop>
