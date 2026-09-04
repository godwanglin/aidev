import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["AIDEV_CLI_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["AIDEV_CLI_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("AIDEV_CLI_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  AIDEV_CLI_AUTO_HEAP_SNAPSHOT: truthy("AIDEV_CLI_AUTO_HEAP_SNAPSHOT"),
  AIDEV_CLI_GIT_BASH_PATH: process.env["AIDEV_CLI_GIT_BASH_PATH"],
  AIDEV_CLI_CONFIG: process.env["AIDEV_CLI_CONFIG"],
  AIDEV_CLI_CONFIG_CONTENT: process.env["AIDEV_CLI_CONFIG_CONTENT"],
  AIDEV_CLI_DISABLE_AUTOUPDATE: truthy("AIDEV_CLI_DISABLE_AUTOUPDATE"),
  AIDEV_CLI_ALWAYS_NOTIFY_UPDATE: truthy("AIDEV_CLI_ALWAYS_NOTIFY_UPDATE"),
  AIDEV_CLI_DISABLE_PRUNE: truthy("AIDEV_CLI_DISABLE_PRUNE"),
  AIDEV_CLI_DISABLE_TERMINAL_TITLE: truthy("AIDEV_CLI_DISABLE_TERMINAL_TITLE"),
  AIDEV_CLI_SHOW_TTFD: truthy("AIDEV_CLI_SHOW_TTFD"),
  AIDEV_CLI_DISABLE_AUTOCOMPACT: truthy("AIDEV_CLI_DISABLE_AUTOCOMPACT"),
  AIDEV_CLI_DISABLE_MODELS_FETCH: truthy("AIDEV_CLI_DISABLE_MODELS_FETCH"),
  AIDEV_CLI_DISABLE_MOUSE: truthy("AIDEV_CLI_DISABLE_MOUSE"),
  AIDEV_CLI_FAKE_VCS: process.env["AIDEV_CLI_FAKE_VCS"],
  AIDEV_CLI_SERVER_PASSWORD: process.env["AIDEV_CLI_SERVER_PASSWORD"],
  AIDEV_CLI_SERVER_USERNAME: process.env["AIDEV_CLI_SERVER_USERNAME"],
  AIDEV_CLI_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("AIDEV_CLI_DISABLE_FFF"),

  // Experimental
  AIDEV_CLI_EXPERIMENTAL_FILEWATCHER: Config.boolean("AIDEV_CLI_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  AIDEV_CLI_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("AIDEV_CLI_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  AIDEV_CLI_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("AIDEV_CLI_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  AIDEV_CLI_MODELS_URL: process.env["AIDEV_CLI_MODELS_URL"],
  AIDEV_CLI_MODELS_PATH: process.env["AIDEV_CLI_MODELS_PATH"],
  AIDEV_CLI_DB: process.env["AIDEV_CLI_DB"],

  AIDEV_CLI_WORKSPACE_ID: process.env["AIDEV_CLI_WORKSPACE_ID"],
  AIDEV_CLI_EXPERIMENTAL_WORKSPACES: enabledByExperimental("AIDEV_CLI_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get AIDEV_CLI_DISABLE_PROJECT_CONFIG() {
    return truthy("AIDEV_CLI_DISABLE_PROJECT_CONFIG")
  },
  get AIDEV_CLI_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("AIDEV_CLI_EXPERIMENTAL_REFERENCES")
  },
  get AIDEV_CLI_TUI_CONFIG() {
    return process.env["AIDEV_CLI_TUI_CONFIG"]
  },
  get AIDEV_CLI_CONFIG_DIR() {
    return process.env["AIDEV_CLI_CONFIG_DIR"]
  },
  get AIDEV_CLI_PURE() {
    return truthy("AIDEV_CLI_PURE")
  },
  get AIDEV_CLI_PERMISSION() {
    return process.env["AIDEV_CLI_PERMISSION"]
  },
  get AIDEV_CLI_PLUGIN_META_FILE() {
    return process.env["AIDEV_CLI_PLUGIN_META_FILE"]
  },
  get AIDEV_CLI_CLIENT() {
    return process.env["AIDEV_CLI_CLIENT"] ?? "cli"
  },
}
