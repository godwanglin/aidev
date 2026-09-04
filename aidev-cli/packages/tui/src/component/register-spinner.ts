import { getComponentCatalogue } from "@opentui/solid/components"
import { registerSpinner } from "opentui-spinner/solid"

export function registerAidevSpinner() {
  if (!getComponentCatalogue().spinner) registerSpinner()
}
