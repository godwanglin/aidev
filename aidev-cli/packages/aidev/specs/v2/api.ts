// @ts-nocheck

import { AidevCLI } from "@aidev-cli/core"
import { ReadTool } from "@aidev-cli/core/tools"

const aidev_cli = AidevCLI.make({})

aidev_cli.tool.add(ReadTool)

aidev_cli.tool.add({
  name: "bash",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run.",
      },
    },
    required: ["command"],
  },
  execute(input, ctx) {},
})

aidev_cli.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

aidev_cli.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await aidev_cli.session.create({
  agent: "build",
})

aidev_cli.subscribe((event) => {
  console.log(event)
})

await aidev_cli.session.prompt({
  sessionID,
  text: "hey what is up",
})

await aidev_cli.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await aidev_cli.session.wait()

console.log(await aidev_cli.session.messages(sessionID))
