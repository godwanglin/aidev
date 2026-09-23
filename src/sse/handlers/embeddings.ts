import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { logRequest } from "@/lib/logger";
import { resolveUpstreamConnection } from "@/lib/router";

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 3.5));
}

/**
 * Handler for POST /v1/embeddings (9router pattern)
 */
export async function handleEmbeddings(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const reqPath = "/v1/embeddings";

  // Authenticate Internal Key
  const auth = await authenticateApiKey(req.headers.get("authorization"), req.headers.get("x-api-key"));
  if (!auth.success || !auth.apiKey) {
    const status = auth.status || 401;
    return NextResponse.json(
      { error: { message: auth.error, type: "auth_error", code: status } },
      { status }
    );
  }

  const rawBody = await req.text().catch(() => "{}");
  let parsedJson: any = {};
  try {
    parsedJson = JSON.parse(rawBody || "{}");
  } catch {}

  const embeddingModel = parsedJson.model || "text-embedding-3-small";
  const input = parsedJson.input || "";
  const apiKeyId = auth.apiKey.id;

  const resolvedRoute = await resolveUpstreamConnection({ model: embeddingModel });
  if (resolvedRoute && resolvedRoute.baseUrl && resolvedRoute.apiKey) {
    if (resolvedRoute.provider === "OPENAI" || resolvedRoute.provider === "OPENROUTER") {
      try {
        const embRes = await fetch(`${resolvedRoute.baseUrl.replace(/\/$/, "")}/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resolvedRoute.apiKey}`,
          },
          body: rawBody,
        });
        if (embRes.ok) {
          const data = await embRes.json();
          const inputStr = typeof input === "string" ? input : JSON.stringify(input);
          const promptTokens = estimateTokens(inputStr) || 8;
          logRequest({
            apiKeyId,
            path: reqPath,
            method: "POST",
            statusCode: 200,
            model: embeddingModel,
            promptTokens,
            completionTokens: 0,
            totalTokens: promptTokens,
            durationMs: Date.now() - startTime,
          });
          return NextResponse.json(data);
        }
      } catch {}
    }
  }

  // Deterministic 1536-dimensional vector fallback for Cursor / local indexers
  const inputStr = typeof input === "string" ? input : Array.isArray(input) ? input.join(" ") : JSON.stringify(input);
  const promptTokens = estimateTokens(inputStr) || 8;

  let hash = 0;
  for (let i = 0; i < inputStr.length; i++) {
    hash = (hash << 5) - hash + inputStr.charCodeAt(i);
    hash |= 0;
  }
  const mockVector = Array.from({ length: 1536 }, (_, idx) => {
    const v = Math.sin(hash + idx * 0.1);
    return Math.round(v * 10000) / 10000;
  });

  logRequest({
    apiKeyId,
    path: reqPath,
    method: "POST",
    statusCode: 200,
    model: embeddingModel,
    promptTokens,
    completionTokens: 0,
    totalTokens: promptTokens,
    durationMs: Date.now() - startTime,
  });

  return NextResponse.json({
    object: "list",
    data: [
      {
        object: "embedding",
        index: 0,
        embedding: mockVector,
      },
    ],
    model: embeddingModel,
    usage: {
      prompt_tokens: promptTokens,
      total_tokens: promptTokens,
    },
  });
}
