export * from "./client.js"
export * from "./server.js"

import { createAidevClient } from "./client.js"
import { createAidevServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export * as data from "./data.js"

export async function createAidev(options?: ServerOptions) {
  const server = await createAidevServer({
    ...options,
  })

  const client = createAidevClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}

export const createOpencodeClient = createAidevClient;
export const createOpencodeServer = createAidevServer;
export const createOpencode = createAidev;
