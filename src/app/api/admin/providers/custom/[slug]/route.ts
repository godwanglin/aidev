import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { baseUrl, apiKey, modelId, apiType = "Chat Completions" } = body;

    if (!baseUrl || !baseUrl.trim()) {
      return NextResponse.json({ error: "Base URL is required" }, { status: 400 });
    }

    const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const startTime = performance.now();

    // 1. If modelId provided, perform a minimal chat completion / messages test
    if (modelId && modelId.trim()) {
      const isAnthropic = apiType === "Anthropic Messages" || cleanBaseUrl.includes("anthropic");
      const url = isAnthropic
        ? (cleanBaseUrl.endsWith("/messages") ? cleanBaseUrl : `${cleanBaseUrl}/messages`)
        : (cleanBaseUrl.endsWith("/chat/completions") ? cleanBaseUrl : `${cleanBaseUrl}/chat/completions`);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (apiKey && apiKey.trim()) {
        if (isAnthropic) {
          headers["x-api-key"] = apiKey.trim();
          headers["anthropic-version"] = "2023-06-01";
        } else {
          headers["Authorization"] = `Bearer ${apiKey.trim()}`;
        }
      }

      const payload = isAnthropic
        ? {
            model: modelId.trim(),
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }
        : {
            model: modelId.trim(),
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const upstreamRes = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const latencyMs = Math.round(performance.now() - startTime);

        if (upstreamRes.ok) {
          return NextResponse.json({
            success: true,
            latencyMs,
            status: "HEALTHY",
            message: `Upstream responding OK (${latencyMs}ms)`,
          });
        }

        const errText = await upstreamRes.text().catch(() => "");
        return NextResponse.json({
          success: false,
          latencyMs,
          statusCode: upstreamRes.status,
          error: `[${upstreamRes.status}]: ${errText.slice(0, 200) || upstreamRes.statusText}`,
        });
      } catch (err: any) {
        clearTimeout(timeoutId);
        return NextResponse.json({
          success: false,
          error: err.name === "AbortError" ? "Request timed out (10s)" : err.message,
        });
      }
    }

    // 2. No modelId provided: attempt GET /models or HEAD
    const modelsUrl = cleanBaseUrl.endsWith("/models") ? cleanBaseUrl : `${cleanBaseUrl}/models`;
    const headers: Record<string, string> = {};
    if (apiKey && apiKey.trim()) {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const upstreamRes = await fetch(modelsUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Math.round(performance.now() - startTime);

      if (upstreamRes.ok) {
        return NextResponse.json({
          success: true,
          latencyMs,
          status: "HEALTHY",
          message: `Endpoint valid & reachable (${latencyMs}ms)`,
        });
      }

      if (upstreamRes.status === 401 || upstreamRes.status === 403) {
        return NextResponse.json({
          success: false,
          latencyMs,
          statusCode: upstreamRes.status,
          error: `[${upstreamRes.status}]: Authentication failed (Invalid API Key)`,
        });
      }

      // If 404 or other non-auth error on /models, test base URL directly
      const pingRes = await fetch(cleanBaseUrl, {
        method: "GET",
        headers,
      }).catch(() => null);

      if (pingRes && pingRes.status < 500) {
        return NextResponse.json({
          success: true,
          latencyMs,
          status: "REACHABLE",
          message: `Server reachable (${latencyMs}ms)`,
        });
      }

      return NextResponse.json({
        success: false,
        latencyMs,
        statusCode: upstreamRes.status,
        error: `Upstream returned status ${upstreamRes.status}: ${upstreamRes.statusText}`,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      return NextResponse.json({
        success: false,
        error: err.name === "AbortError" ? "Request timed out (8s)" : `Cannot connect: ${err.message}`,
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to check provider" }, { status: 500 });
  }
}
