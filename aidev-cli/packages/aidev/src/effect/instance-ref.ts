import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@aidev-cli/core/workspace"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~aidev-cli/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~aidev-cli/WorkspaceRef", {
  defaultValue: () => undefined,
})
