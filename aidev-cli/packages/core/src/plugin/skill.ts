/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeOpencodeContent from "./skill/customize-aidev.md" with { type: "text" }

export const CustomizeOpencodeContent = customizeOpencodeContent

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-aidev-cli",
            description:
              "Use ONLY when the user is editing or creating aidev_cli's own configuration: aidev_cli.json, aidev_cli.jsonc, files under .aidev-cli/, or files under ~/.config/aidev-cli/. Also use when creating or fixing aidev_cli agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring aidev_cli itself.",
            location: AbsolutePath.make("/builtin/customize-aidev_cli.md"),
            content: CustomizeOpencodeContent,
          }),
        }),
      )
    })
  }),
})
