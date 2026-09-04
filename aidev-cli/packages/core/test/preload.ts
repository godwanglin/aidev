import path from "path"

process.env.AIDEV_CLI_DB = ":memory:"
process.env.AIDEV_CLI_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.AIDEV_CLI_DISABLE_MODELS_FETCH = "true"
