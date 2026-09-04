export * as PublicEventManifest from "./public-event-manifest"

import { Event } from "@aidev-cli/schema/event"
import { EventManifest } from "@aidev-cli/schema/event-manifest"

export const Definitions = EventManifest.ServerDefinitions
export const Latest = Event.latest(Definitions)
