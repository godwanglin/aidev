import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { logRequest } from "@/lib/logger";
import { resolveUpstreamConnection } from "@/lib/router";

interface ImageGenerationBody {
  prompt: string;
  model?: string;
  n?: number;
  quality?: "standard" | "hd";
  response_format?: "b64_json" | "url";
  size?: "1024x1024" | "1024x1792" | "1792x1024" | "512x512" | string;
  style?: "vivid" | "natural";
}

/**
 * Parses width and height integers from size string (e.g. "1024x1024")
 */
function parseDimensions(sizeStr?: string): { width: number; height: number } {
  if (!sizeStr) return { width: 1024, height: 1024 };
  const parts = sizeStr.toLowerCase().split("x");
  const width = parseInt(parts[0], 10) || 1024;
  const height = parseInt(parts[1], 10) || width;
  return { width, height };
}

/**
 * Handler for POST /v1/images/generations (OpenAI-compatible Image Generation API)
 */
export async function handleImagesGenerations(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const reqPath = "/v1/images/generations";

  // 1. Authenticate Internal API Key
  const auth = await authenticateApiKey(req.headers.get("authorization"), req.headers.get("x-api-key"));
  if (!auth.success || !auth.apiKey) {
    const status = auth.status || 401;
    return NextResponse.json(
      { error: { message: auth.error, type: "auth_error", code: status } },
      { status }
    );
  }

  const rawBody = await req.text().catch(() => "{}");
  let body: ImageGenerationBody;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON request body", type: "invalid_request_error", code: 400 } },
      { status: 400 }
    );
  }

  const prompt = (body.prompt || "").trim();
  if (!prompt) {
    return NextResponse.json(
      { error: { message: "The 'prompt' field is required.", type: "invalid_request_error", code: 400 } },
      { status: 400 }
    );
  }

  const model = body.model || "dall-e-3";
  const responseFormat = body.response_format || "b64_json";
  const { width, height } = parseDimensions(body.size);
  const apiKeyId = auth.apiKey.id;

  // 2. Try Upstream Connection if available (e.g. direct OpenAI DALL-E)
  try {
    const resolvedRoute = await resolveUpstreamConnection({ model });
    if (resolvedRoute && resolvedRoute.baseUrl && resolvedRoute.apiKey) {
      if (resolvedRoute.provider === "OPENAI" || resolvedRoute.provider === "OPENROUTER") {
        const upstreamUrl = `${resolvedRoute.baseUrl.replace(/\/$/, "")}/images/generations`;
        const upstreamRes = await fetch(upstreamUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resolvedRoute.apiKey}`,
          },
          body: rawBody,
        });

        if (upstreamRes.ok) {
          const data = await upstreamRes.json();
          logRequest({
            apiKeyId,
            path: reqPath,
            method: "POST",
            statusCode: 200,
            model,
            promptTokens: Math.ceil(prompt.length / 4) || 20,
            completionTokens: 0,
            totalTokens: Math.ceil(prompt.length / 4) || 20,
            durationMs: Date.now() - startTime,
          });
          return NextResponse.json(data);
        }
      }
    }
  } catch (upstreamErr) {
    // Upstream failed or unconfigured, proceed to high-fidelity engine fallback
  }

  // 3. Resilient High-Fidelity Engine Fallback (Flux / High-Res Synthesis)
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const candidateUrls = [
      `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true`,
      `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=turbo&nologo=true`,
      `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=flux&nologo=true`,
    ];

    let imageBuffer: Buffer | null = null;
    let finalImageUrl: string | null = null;

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(18000),
          headers: {
            "User-Agent": "AidevGateway/1.1 (Universal-AI-Engine)",
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          },
        });

        if (res.ok) {
          const arrBuf = await res.arrayBuffer();
          if (arrBuf.byteLength > 1000) {
            imageBuffer = Buffer.from(arrBuf);
            finalImageUrl = url;
            break;
          }
        }
      } catch {}
    }

    if (!imageBuffer) {
      return NextResponse.json(
        {
          error: {
            message: "Image generation pipeline was unable to process request at this time. Please retry.",
            type: "api_error",
            code: 502,
          },
        },
        { status: 502 }
      );
    }

    // 4. Construct OpenAI-compliant response payload
    const responseItem: { b64_json?: string; url?: string; revised_prompt?: string } = {
      revised_prompt: prompt,
    };

    if (responseFormat === "b64_json") {
      responseItem.b64_json = imageBuffer.toString("base64");
    } else {
      // If client explicitly requested URL format, return data URL or direct image URI
      responseItem.url = finalImageUrl || `data:image/jpeg;base64,${imageBuffer.toString("base64")}`;
    }

    logRequest({
      apiKeyId,
      path: reqPath,
      method: "POST",
      statusCode: 200,
      model,
      promptTokens: Math.ceil(prompt.length / 4) || 20,
      completionTokens: 0,
      totalTokens: Math.ceil(prompt.length / 4) || 20,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({
      created: Math.floor(Date.now() / 1000),
      data: [responseItem],
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: {
          message: err?.message || "Internal server error during image generation",
          type: "server_error",
          code: 500,
        },
      },
      { status: 500 }
    );
  }
}
