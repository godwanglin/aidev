interface ImportMetaEnv {
  readonly AIDEV_CLI_CHANNEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:aidev_cli-server" {
  export namespace Server {
    export const listen: typeof import("../../../aidev-cli/dist/types/src/node").Server.listen
    export type Listener = import("../../../aidev-cli/dist/types/src/node").Server.Listener
  }
  export namespace Config {
    export const get: typeof import("../../../aidev-cli/dist/types/src/node").Config.get
    export type Info = import("../../../aidev-cli/dist/types/src/node").Config.Info
  }
  export const bootstrap: typeof import("../../../aidev-cli/dist/types/src/node").bootstrap
}
