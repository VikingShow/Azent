import { run as runTui, type TuiInput } from "@azent/tui"
import { Global } from "@azent/core/global"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(Global.defaultLayer))
}
