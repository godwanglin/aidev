import { Layer, ManagedRuntime } from "effect"
import { AppNodeBuilder } from "@aidev-cli/core/effect/app-node-builder"
import { LayerNode } from "@aidev-cli/core/effect/layer-node"

import { Plugin } from "@/plugin"
import { LSP } from "@/lsp/lsp"
import { Format } from "@/format"
import { ShareNext } from "@/share/share-next"
import { Vcs } from "@/project/vcs"
import { Snapshot } from "@/snapshot"
import { Config } from "@/config/config"
import * as Observability from "@aidev-cli/core/observability"
import { memoMap } from "@aidev-cli/core/effect/memo-map"

export const BootstrapLayer = AppNodeBuilder.build(
  LayerNode.group([Config.node, Plugin.node, ShareNext.node, Format.node, LSP.node, Vcs.node, Snapshot.node]),
).pipe(Layer.provide(Observability.layer))

export const BootstrapRuntime = ManagedRuntime.make(BootstrapLayer, { memoMap })
