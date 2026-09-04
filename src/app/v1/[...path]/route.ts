import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { logRequest } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const UPSTREAM_BASE = (process.env.UPSTREAM_BASE_URL || "https://9rt.topupin.store/v1").replace(/\/$/, "");
const UPSTREAM_KEY = process.env.UPSTREAM_API_KEY || "";

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 3.5));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const startTime = Date.now();
  const { path } = await params;
  const subPath = path ? path.join("/") : "";
  const targetUrl = `${UPSTREAM_BASE}/${subPath}${req.nextUrl.search}`;
  const reqPath = `/v1/${subPath}`;

  let rawBody: string | undefined;
  let parsedModel: string | undefined;
  let clientWantsStream = false;
  let estimatedPromptTokens = 0;

  try {
    const rawText = await req.text();
    if (rawText) {
      rawBody = rawText;
      estimatedPromptTokens = estimateTokens(rawText);
      try {
        const jsonBody = JSON.parse(rawText);
        parsedModel = jsonBody.model;
        clientWantsStream = Boolean(jsonBody.stream);

        if (Array.isArray(jsonBody.messages)) {
          const combinedMsg = jsonBody.messages
            .map((m: any) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content || "")))
            .join(" ");
          estimatedPromptTokens = estimateTokens(combinedMsg);
        }
      } catch {}
    }
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid request payload", type: "invalid_request_error" } },
      { status: 400 }
    );
  }

  // Authenticate Internal Key
  const auth = await authenticateApiKey(req.headers.get("authorization"));
  if (!auth.success || !auth.apiKey) {
    const status = auth.status || 401;
    return NextResponse.json(
      { error: { message: auth.error, type: "auth_error", code: status } },
      { status }
    );
  }

  const apiKeyId = auth.apiKey.id;

  const forwardHeaders = new Headers();
  forwardHeaders.set("Authorization", `Bearer ${UPSTREAM_KEY}`);
  forwardHeaders.set("Content-Type", "application/json");

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: "POST",
      headers: forwardHeaders,
      body: rawBody,
    });

    const isUpstreamSSE = upstreamRes.headers.get("content-type")?.includes("text/event-stream");

    // Case 1: Client explicitly requested Streaming (SSE)
    if (clientWantsStream && upstreamRes.body) {
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;
      let generatedText = "";

      const transformStream = new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(chunk);
          try {
            const text = new TextDecoder().decode(chunk);
            const lines = text.split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === "data: [DONE]") continue;

              const jsonStr = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;
              try {
                const data = JSON.parse(jsonStr);
                const delta = data.choices?.[0]?.delta?.content || data.choices?.[0]?.delta?.reasoning || "";
                generatedText += delta;

                if (data.usage) {
                  promptTokens = data.usage.prompt_tokens || promptTokens;
                  completionTokens = data.usage.completion_tokens || completionTokens;
                  totalTokens = data.usage.total_tokens || (promptTokens + completionTokens);
                }
              } catch {}
            }
          } catch {}
        },
        flush() {
          const durationMs = Date.now() - startTime;
          if (totalTokens === 0) {
            promptTokens = promptTokens || estimatedPromptTokens || 10;
            completionTokens = completionTokens || estimateTokens(generatedText) || 15;
            totalTokens = promptTokens + completionTokens;
          }

          logRequest({
            apiKeyId,
            path: reqPath,
            method: "POST",
            statusCode: upstreamRes.status,
            model: parsedModel,
            promptTokens,
            completionTokens,
            totalTokens,
            durationMs,
          });
        },
      });

      return new Response(upstreamRes.body.pipeThrough(transformStream), {
        status: upstreamRes.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    }

    // Case 2: Client requested Non-Streaming (Standard JSON)
    const rawResponseText = await upstreamRes.text();
    const durationMs = Date.now() - startTime;

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let finalPayload: any = null;

    try {
      let text = rawResponseText.trim();
      if (text.startsWith("data: ")) {
        const lines = text.split("\n");
        let content = "";
        for (const line of lines) {
          if (line.startsWith("data: ") && !line.includes("[DONE]")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              content += parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || "";
              if (parsed.usage) {
                promptTokens = parsed.usage.prompt_tokens || promptTokens;
                completionTokens = parsed.usage.completion_tokens || completionTokens;
                totalTokens = parsed.usage.total_tokens || (promptTokens + completionTokens);
              }
            } catch {}
          }
        }
        finalPayload = {
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: parsedModel,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: promptTokens || estimatedPromptTokens || 15,
            completion_tokens: completionTokens || estimateTokens(content) || 25,
            total_tokens: totalTokens || (promptTokens + completionTokens) || 40,
          },
        };
      } else {
        const firstBrace = text.indexOf("{");
        const lastBrace = text.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          finalPayload = JSON.parse(text.substring(firstBrace, lastBrace + 1));
          if (finalPayload.usage) {
            promptTokens = finalPayload.usage.prompt_tokens || 0;
            completionTokens = finalPayload.usage.completion_tokens || 0;
            totalTokens = finalPayload.usage.total_tokens || (promptTokens + completionTokens);
          }
        }
      }
    } catch {}

    if (totalTokens === 0) {
      promptTokens = estimatedPromptTokens || 15;
      completionTokens = 25;
      totalTokens = promptTokens + completionTokens;
    }

    logRequest({
      apiKeyId,
      path: reqPath,
      method: "POST",
      statusCode: upstreamRes.status,
      model: parsedModel,
      promptTokens,
      completionTokens,
      totalTokens,
      durationMs,
    });

    if (finalPayload) {
      return NextResponse.json(finalPayload, { status: upstreamRes.status });
    }

    return new Response(rawResponseText, {
      status: upstreamRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    logRequest({
      apiKeyId,
      path: reqPath,
      method: "POST",
      statusCode: 502,
      model: parsedModel,
      durationMs,
    });

    return NextResponse.json(
      { error: { message: `Upstream gateway error: ${err.message}`, type: "api_error" } },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const subPath = path ? path.join("/") : "";

  if (subPath === "models" || subPath === "models/") {
    const dbModels = await prisma.aiModel.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      object: "list",
      data: dbModels.map((m) => ({
        id: m.modelId,
        object: "model",
        created: Math.floor(new Date(m.createdAt).getTime() / 1000),
        owned_by: m.provider.toLowerCase(),
        permission: [],
        root: m.modelId,
        parent: null,
      })),
    });
  }

  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
