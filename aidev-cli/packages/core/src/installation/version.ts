declare global {
  const AIDEV_CLI_VERSION: string
  const AIDEV_CLI_CHANNEL: string
}

export const InstallationVersion = typeof AIDEV_CLI_VERSION === "string" ? AIDEV_CLI_VERSION : "local"
export const InstallationChannel = typeof AIDEV_CLI_CHANNEL === "string" ? AIDEV_CLI_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
