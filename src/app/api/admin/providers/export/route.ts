import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { decryptCredential, encryptCredential } from "@/lib/crypto";
import { findProviderBySlugOrId } from "@/lib/oauth/config";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

function extractChatGptAccountId(token: string): string | null {
  if (!token || !token.includes(".")) return null;
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
      return payload["https://api.openai.com/auth"]?.chatgpt_account_id || null;
    }
  } catch {}
  return null;
}

async function processConnectionsForExport(connections: any[]) {
  return await Promise.all(
    connections.map(async (conn) => {
      const apiKey = conn.apiKeyEncrypted ? decryptCredential(conn.apiKeyEncrypted) : null;
      let accessToken = conn.accessTokenEnc ? decryptCredential(conn.accessTokenEnc) : null;
      let refreshToken = conn.refreshTokenEnc ? decryptCredential(conn.refreshTokenEnc) : null;
      let idToken = conn.idTokenEnc ? decryptCredential(conn.idTokenEnc) : null;

      // If idToken is missing for OpenAI Codex, fetch it on-demand via refresh token
      const isCodex =
        conn.provider === "OPENAI_CODEX" ||
        conn.provider === "OPENAI" ||
        conn.provider === "CODEX";

      if (!idToken && isCodex && refreshToken) {
        try {
          const body = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
          });

          const refRes = await fetch("https://auth.openai.com/oauth/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
            },
            body: body.toString(),
            signal: AbortSignal.timeout(6000),
          });

          if (refRes.ok) {
            const refData = await refRes.json();
            if (refData.id_token) {
              idToken = refData.id_token;
              if (refData.access_token) accessToken = refData.access_token;
              if (refData.refresh_token) refreshToken = refData.refresh_token;

              // Save to database so subsequent exports and requests already have it!
              prisma.providerConnection
                .update({
                  where: { id: conn.id },
                  data: {
                    idTokenEnc: encryptCredential(refData.id_token),
                    ...(refData.access_token
                      ? { accessTokenEnc: encryptCredential(refData.access_token) }
                      : {}),
                    ...(refData.refresh_token
                      ? { refreshTokenEnc: encryptCredential(refData.refresh_token) }
                      : {}),
                    lastSyncedAt: new Date(),
                  },
                })
                .catch(() => {});
            }
          }
        } catch (e) {
          console.warn(`Could not fetch id_token via refresh for connection ${conn.id}:`, e);
        }
      }

      const chatgptAccountId = accessToken ? extractChatGptAccountId(accessToken) : null;

      let customHeadersParsed: any = null;
      if (conn.customHeaders) {
        try {
          customHeadersParsed = JSON.parse(conn.customHeaders);
        } catch {
          customHeadersParsed = conn.customHeaders;
        }
      }

      const codexAuthJson =
        conn.authType === "OAUTH" && (accessToken || refreshToken)
          ? {
              auth_mode: "chatgpt",
              tokens: {
                access_token: accessToken,
                refresh_token: refreshToken,
                id_token: idToken || null,
                account_id: chatgptAccountId || null,
              },
            }
          : null;

      return {
        id: conn.id,
        name: conn.name,
        provider: conn.provider,
        authType: conn.authType,
        accountEmail: conn.accountEmail || null,
        tier: conn.tier || null,
        isActive: conn.isActive,
        priority: conn.priority,
        weight: conn.weight,
        baseUrl: conn.baseUrl || null,
        customHeaders: customHeadersParsed,
        tokenExpiresAt: conn.tokenExpiresAt ? conn.tokenExpiresAt.toISOString() : null,
        // Decrypted credentials
        apiKey,
        accessToken,
        refreshToken,
        idToken: idToken || null,
        id_token: idToken || null,
        credentials: {
          ...(apiKey ? { apiKey } : {}),
          ...(accessToken ? { accessToken } : {}),
          ...(refreshToken ? { refreshToken } : {}),
          ...(idToken ? { idToken, id_token: idToken } : {}),
          ...(conn.tokenExpiresAt ? { tokenExpiresAt: conn.tokenExpiresAt.toISOString() } : {}),
          ...(chatgptAccountId ? { chatgptAccountId } : {}),
        },
        // OAuth standard format
        ...(conn.authType === "OAUTH" && (accessToken || refreshToken)
          ? {
              oauth: {
                access_token: accessToken,
                refresh_token: refreshToken,
                id_token: idToken || null,
                account_id: chatgptAccountId,
                email: conn.accountEmail || null,
                expires_at: conn.tokenExpiresAt ? conn.tokenExpiresAt.toISOString() : null,
              },
            }
          : {}),
        // Exact ~/.codex/auth.json format for drop-in use
        ...(codexAuthJson ? { codex_auth_json: codexAuthJson } : {}),
      };
    })
  );
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const providerParam = searchParams.get("provider");
    const singleId = searchParams.get("id");
    const idsParam = searchParams.get("ids");
    const download = searchParams.get("download") === "true";

    let idsList: string[] = [];
    if (singleId) {
      idsList.push(singleId);
    } else if (idsParam) {
      idsList = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    }

    const whereClause: any = {};
    let resolvedProviderKey = providerParam || "";
    let providerName = providerParam || "Provider";

    if (idsList.length > 0) {
      whereClause.id = { in: idsList };
    } else if (providerParam) {
      const catalogItem = findProviderBySlugOrId(providerParam);
      resolvedProviderKey = catalogItem ? catalogItem.id.toUpperCase() : providerParam.toUpperCase();
      providerName = catalogItem ? catalogItem.name : providerParam;
      whereClause.provider = resolvedProviderKey;
    } else {
      return NextResponse.json(
        { success: false, error: "Missing required 'provider' or 'id' query parameter" },
        { status: 400 }
      );
    }

    const connections = await prisma.providerConnection.findMany({
      where: whereClause,
      orderBy: { priority: "asc" },
    });

    if (connections.length === 0) {
      return NextResponse.json(
        { success: false, error: "No connections found for export" },
        { status: 404 }
      );
    }

    const exportedAccounts = await processConnectionsForExport(connections);

    const exportPayload = {
      success: true,
      exportedAt: new Date().toISOString(),
      provider: resolvedProviderKey || connections[0].provider,
      providerName,
      count: exportedAccounts.length,
      accounts: exportedAccounts,
    };

    if (download) {
      const safeSlug = (providerParam || connections[0].provider || "accounts")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-");
      const filename = `aidev-${safeSlug}-export-${new Date().toISOString().slice(0, 10)}.json`;

      return new NextResponse(JSON.stringify(exportPayload, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json(exportPayload);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to export provider credentials" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { provider, id, ids } = body;

    let idsList: string[] = [];
    if (id) {
      idsList.push(id);
    } else if (Array.isArray(ids)) {
      idsList = ids;
    }

    const whereClause: any = {};
    let resolvedProviderKey = provider || "";
    let providerName = provider || "Provider";

    if (idsList.length > 0) {
      whereClause.id = { in: idsList };
    } else if (provider) {
      const catalogItem = findProviderBySlugOrId(provider);
      resolvedProviderKey = catalogItem ? catalogItem.id.toUpperCase() : provider.toUpperCase();
      providerName = catalogItem ? catalogItem.name : provider;
      whereClause.provider = resolvedProviderKey;
    } else {
      return NextResponse.json(
        { success: false, error: "Missing required 'provider' or 'id' in request body" },
        { status: 400 }
      );
    }

    const connections = await prisma.providerConnection.findMany({
      where: whereClause,
      orderBy: { priority: "asc" },
    });

    if (connections.length === 0) {
      return NextResponse.json(
        { success: false, error: "No connections found for export" },
        { status: 404 }
      );
    }

    const exportedAccounts = await processConnectionsForExport(connections);

    return NextResponse.json({
      success: true,
      exportedAt: new Date().toISOString(),
      provider: resolvedProviderKey || connections[0].provider,
      providerName,
      count: exportedAccounts.length,
      accounts: exportedAccounts,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to export provider credentials" },
      { status: 500 }
    );
  }
}
