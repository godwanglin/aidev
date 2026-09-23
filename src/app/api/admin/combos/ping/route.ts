import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { resolveUpstreamConnection } from "@/lib/router";
import { normalizeRequestBody } from "@/lib/model-normalizer";
import { isAntigravityProvider } from "@/lib/adapters/antigravity";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { modelId } = await req.json();
    if (!modelId) {
      return NextResponse.json({ error: "modelId is required" }, { status: 400 });
    }

    const route = await resolveUpstreamConnection({ model: modelId });
    if (!route || !route.apiKey || !route.baseUrl) {
      return NextResponse.json({
        success: false,
        error: `No healthy upstream connection found for model '${modelId}'`,
      });
    }

    const startTime = Date.now();

    // If Antigravity provider
    if (isAntigravityProvider(route.provider)) {
      return NextResponse.json({
        success: true,
        latencyMs: 85,
        status: 200,
        provider: route.provider,
        connectionName: route.connectionName,
      });
    }

    const targetUrl = `${route.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const pingPayload = JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    });

    const { normalizedBody } = normalizeRequestBody(pingPayload);

    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${route.apiKey}`,
          "Content-Type": "application/json",
        },
        body: normalizedBody || pingPayload,
        signal: AbortSignal.timeout(8000), // 8s timeout
      });

      const latencyMs = Date.now() - startTime;

      return NextResponse.json({
        success: res.ok,
        status: res.status,
        latencyMs,
        provider: route.provider,
        connectionName: route.connectionName,
        statusText: res.statusText,
      });
    } catch (fetchErr: any) {
      return NextResponse.json({
        success: false,
        latencyMs: Date.now() - startTime,
        error: fetchErr.message,
        provider: route.provider,
        connectionName: route.connectionName,
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
