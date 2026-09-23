import { NextRequest } from "next/server";
import { handleChat } from "@/sse/handlers/chat";

/**
 * POST /v1/responses/compact - Compact conversation context (9router pattern)
 * Reuses the same handleChat pipeline for OpenAI Codex conversation compaction.
 */
export async function POST(request: NextRequest) {
  return handleChat(request, { subPath: "responses" });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
