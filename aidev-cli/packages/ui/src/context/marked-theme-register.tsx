import { registerCustomTheme } from "@pierre/diffs"
import { AidevCLITheme } from "./marked-theme"

let registered = false

export function registerAidevCLITheme() {
  if (registered) return
  registered = true
  registerCustomTheme("AidevCLI", () => Promise.resolve(AidevCLITheme))
}
