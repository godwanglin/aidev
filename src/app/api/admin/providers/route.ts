import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { maskApiKey, decryptCredential, encryptCredential } from "@/lib/crypto";
import { findProviderBySlugOrId } from "@/lib/oauth/config";
import { parseCookieInput, verifyAndFetchChatGptSession } from "@/lib/web-providers/chatgpt-session";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const connections = await prisma.providerConnection.findMany();
    
    // Process connections and mask keys
    const processedConnections = connections.map(conn => {
      let maskedApiKey = null;
      if (conn.apiKeyEncrypted) {
        try {
          const decrypted = decryptCredential(conn.apiKeyEncrypted);
          if (conn.authType === "COOKIE") {
            maskedApiKey = "Cookie Session (Active)";
          } else {
            maskedApiKey = maskApiKey(decrypted);
          }
        } catch (e) {
          maskedApiKey = "****ERROR****";
        }
      }
      
      const { apiKeyEncrypted, accessTokenEnc, refreshTokenEnc, ...rest } = conn as any;
      return {
        ...rest,
        maskedApiKey
      };
    });

    // Generate summary
    const summaryMap = new Map();
    for (const conn of connections) {
      if (!summaryMap.has(conn.provider)) {
        summaryMap.set(conn.provider, { provider: conn.provider, totalConnections: 0, healthy: 0, rateLimited: 0 });
      }
      const stats = summaryMap.get(conn.provider);
      stats.totalConnections++;
      if (conn.syncStatus === 'NORMAL') stats.healthy++;
      if (conn.syncStatus === 'LOW_QUOTA' || (conn.cooldownUntil && new Date(conn.cooldownUntil) > new Date())) stats.rateLimited++;
    }

    return NextResponse.json({
      connections: processedConnections,
      summary: Array.from(summaryMap.values())
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { provider, name, authType = "API_KEY", apiKey, baseUrl, compatibility, customHeaders, accountEmail, priority = 1, weight = 1 } = body;

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 });
    }

    const catalogItem = findProviderBySlugOrId(provider);
    const providerKey = (catalogItem ? catalogItem.id : provider).toUpperCase().trim();

    // Auto-resolve base URL from catalog mapping if not provided
    const effectiveBaseUrl = baseUrl?.trim() || catalogItem?.baseUrl || (
      providerKey === "DEEPSEEK" ? "https://api.deepseek.com" :
      providerKey === "ALIBABA" || providerKey === "QWEN" ? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" :
      providerKey === "OLLAMA_CLOUD" || providerKey === "OLLAMA" ? "https://ollama.com/v1" :
      providerKey === "GROQ" ? "https://api.groq.com/openai/v1" :
      providerKey === "OPENROUTER" ? "https://openrouter.ai/api/v1" :
      providerKey === "MISTRAL" ? "https://api.mistral.ai/v1" :
      providerKey === "TOGETHER" ? "https://api.together.xyz/v1" :
      undefined
    );

    if (providerKey === "CUSTOM" && !effectiveBaseUrl) {
      return NextResponse.json({ error: "baseUrl is required for CUSTOM provider" }, { status: 400 });
    }

    let apiKeyEncrypted = null;
    let accessTokenEnc = null;
    let tokenExpiresAt = null;
    let finalAccountEmail = accountEmail;

    // Special verification and handling for COOKIE authType / CHATGPT_WEB
    if (authType === "COOKIE" || providerKey === "CHATGPT_WEB") {
      if (!apiKey || !apiKey.trim()) {
        return NextResponse.json({ error: "Cookie akun wajib diisi." }, { status: 400 });
      }

      const parsed = parseCookieInput(apiKey);
      if (!parsed.cookieString) {
        return NextResponse.json({ error: "Format cookie tidak valid." }, { status: 400 });
      }

      // Live verify session with chatgpt.com
      const sessionResult = await verifyAndFetchChatGptSession(parsed.cookieString);
      if (!sessionResult.success || !sessionResult.accessToken) {
        return NextResponse.json(
          { error: sessionResult.error || "Gagal memverifikasi sesi cookie ChatGPT." },
          { status: 400 }
        );
      }

      apiKeyEncrypted = encryptCredential(parsed.cookieString);
      accessTokenEnc = encryptCredential(sessionResult.accessToken);
      if (sessionResult.expires) {
        tokenExpiresAt = new Date(sessionResult.expires);
      }
      if (sessionResult.user?.email) {
        finalAccountEmail = sessionResult.user.email;
      }
    } else if (apiKey) {
      apiKeyEncrypted = encryptCredential(apiKey);
    }

    const newConnection = await prisma.providerConnection.create({
      data: {
        provider: providerKey,
        name: name?.trim() || `${catalogItem?.name || providerKey} Account`,
        authType: authType === "COOKIE" ? "COOKIE" : authType,
        apiKeyEncrypted,
        accessTokenEnc,
        tokenExpiresAt,
        baseUrl: effectiveBaseUrl,
        compatibility: compatibility || "OPENAI",
        customHeaders,
        accountEmail: finalAccountEmail,
        priority: Number(priority) || 1,
        weight: Number(weight) || 1,
        syncStatus: 'NORMAL'
      }
    });

    return NextResponse.json(newConnection, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
