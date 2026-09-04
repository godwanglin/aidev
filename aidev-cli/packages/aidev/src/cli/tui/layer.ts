import { run as runTui, type TuiInput } from "@aidev-cli/tui"
import { Global } from "@aidev-cli/core/global"
import { AppNodeBuilder } from "@aidev-cli/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
