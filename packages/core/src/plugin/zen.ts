export * as ZenPlugin from "./zen"

import { Effect } from "effect"
import { PluginV2 } from "../plugin"

/**
 * Zen Layer Plugin — registers Zen-specific hooks for the PluginV2 system.
 *
 * This plugin declares the zen.* hook implementations that will be consumed
 * by the V2 session runner and tool execution paths. The hooks provide:
 *
 * - `zen.gate` — gate enforcement for destructive tools
 * - `zen.drift` — drift detection on agent output
 * - `zen.context.render` — render Zen context for injection
 * - `zen.boundary.declared` — validate boundary declarations
 *
 * Hook consumers (V2 runner, tools) trigger these hooks and use the output
 * to enforce Zen protocols. Implementations are provided at the app layer
 * where ZenService is available.
 */
export const Plugin = PluginV2.define({
  id: PluginV2.ID.make("zen"),
  effect: Effect.gen(function* () {
    // Hook implementations are provided at the app layer where ZenService
    // is available. This plugin simply registers the plugin identity.
    // The hooks are:
    //
    // - zen.gate(input, output): set output.allowed = false to block
    // - zen.drift(input, output): set output.driftDetected = true
    // - zen.context.render(input, output): set output.contextText
    // - zen.boundary.declared(input, output): push to output.warnings/suggestions
    //
    // See plugin.ts HookSpec for full input/output shapes.
  }),
})
