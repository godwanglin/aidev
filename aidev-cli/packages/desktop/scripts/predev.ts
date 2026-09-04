import { $ } from "bun"
import { downloadCliToResources } from "./utils"

await $`bun run install-electron`

await $`bun ./scripts/copy-icons.ts ${process.env.AIDEV_CLI_CHANNEL ?? "dev"}`

await $`cd ../aidev-cli && bun script/build-node.ts`
await downloadCliToResources()
