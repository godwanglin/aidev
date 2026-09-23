import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { resolveUpstreamConnection } from "@/lib/router";
import { normalizeModelRequest, validateModelForProvider } from "@/lib/model-normalizer";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const { modelId, provider } = await req.json();

    if (!modelId || typeof modelId !== "string") {
      return NextResponse.json(
        { success: false, status: "ERROR", error: "Model ID is required" },
        { status: 400 }
      );
    }

    const norm = normalizeModelRequest(modelId);
    const targetProvider = (provider || norm.providerId || "ANTIGRAVITY").toUpperCase().trim();

    // 1. Validate if model is recognized for this provider
    const validation = validateModelForProvider(modelId, targetProvider);
    if (!validation.isValid) {
      return NextResponse.json({
        success: false,
        latencyMs: 0,
        provider: targetProvider,
        status: "INVALID_MODEL",
        statusCode: 404,
        error: validation.reason || `Model '${modelId}' tidak valid untuk provider ${targetProvider}.`,
      });
    }

    // 2. Resolve upstream connection
    const start = Date.now();
    const route = await resolveUpstreamConnection({ model: modelId, provider: targetProvider });

    if (!route || !route.apiKey) {
      return NextResponse.json({
        success: false,
        latencyMs: 0,
        provider: targetProvider,
        status: "NO_CONNECTION",
        statusCode: 503,
        error: `Tidak ada akun koneksi aktif untuk provider ${targetProvider}. Tambahkan koneksi di menu Providers terlebih dahulu.`,
      });
    }

    let targetBase = route.baseUrl;
    let targetKey = route.apiKey;
    let providerName = route.provider;
    let connectionName = route.connectionName;

    // Provider-specific ping endpoint
    let pingUrl = `${targetBase.replace(/\/$/, "")}/models`;
    const headers: Record<string, string> = {};

    if (providerName === "GEMINI" || (targetKey && (targetKey.startsWith("AIza") || targetKey.startsWith("AQ.")))) {
      pingUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${targetKey}`;
      headers["Accept"] = "application/json";
    } else if (providerName === "ANTIGRAVITY") {
      pingUrl = "https://www.googleapis.com/oauth2/v3/userinfo";
      if (targetKey) headers["Authorization"] = `Bearer ${targetKey}`;
    } else if ((providerName === "OPENAI_CODEX" || providerName === "CODEX") && targetKey.length > 200) {
      pingUrl = "https://chatgpt.com/backend-api/wham/usage";
      headers["Authorization"] = `Bearer ${targetKey}`;
      headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
      headers["Accept"] = "application/json";
      if (targetKey.includes(".")) {
        try {
          const parts = targetKey.split(".");
          const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
          const accountId = payload["https://api.openai.com/auth"]?.chatgpt_account_id;
          if (accountId) headers["ChatGPT-Account-Id"] = accountId;
        } catch {}
      }
    } else {
      if (targetKey) headers["Authorization"] = `Bearer ${targetKey}`;
    }

    try {
      const res = await fetch(pingUrl, { headers });
      const latencyMs = Date.now() - start;

      const isHealthy = res.ok;
      const status = isHealthy
        ? "HEALTHY"
        : res.status === 429
        ? "RATE_LIMITED"
        : "ERROR";

      return NextResponse.json({
        success: isHealthy,
        latencyMs,
        statusCode: res.status,
        provider: providerName,
        connectionName,
        status,
        error: !isHealthy ? `Upstream HTTP ${res.status}` : undefined,
      });
    } catch (fetchErr: any) {
      const latencyMs = Date.now() - start;
      return NextResponse.json({
        success: false,
        latencyMs,
        provider: providerName,
        connectionName,
        status: "OFFLINE",
        error: fetchErr.message || "Connection timed out",
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
