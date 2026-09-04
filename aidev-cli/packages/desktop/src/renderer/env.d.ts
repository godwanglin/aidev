import type { ElectronAPI } from "../preload/types"

declare global {
  interface Window {
    api: ElectronAPI
    __AIDEV_CLI__?: {
      deepLinks?: string[]
    }
  }
}
