import { addons, types } from "storybook/manager-api"
import { ThemeTool } from "./theme-tool"

addons.register("aidev-cli/theme-toggle", () => {
  addons.add("aidev-cli/theme-toggle/tool", {
    type: types.TOOL,
    title: "Theme",
    match: ({ viewMode }) => viewMode === "story" || viewMode === "docs",
    render: ThemeTool,
  })
})
