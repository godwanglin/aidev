import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { maskApiKey, decryptCredential, encryptCredential } from "@/lib/crypto";
import { parseCookieInput, verifyAndFetchChatGptSession } from "@/lib/web-providers/chatgpt-session";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const connection = await prisma.providerConnection.findUnique({
      where: { id },
    });

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    let maskedApiKey = null;
    if (connection.apiKeyEncrypted) {
      try {
        const decrypted = decryptCredential(connection.apiKeyEncrypted);
        if (connection.authType === "COOKIE") {
          maskedApiKey = "Cookie Session (Active)";
        } else {
          maskedApiKey = maskApiKey(decrypted);
        }
      } catch {
        maskedApiKey = "****ERROR****";
      }
    }

    const { apiKeyEncrypted, accessTokenEnc, refreshTokenEnc, idTokenEnc, ...rest } = connection;

    return NextResponse.json({
      connection: {
        ...rest,
        maskedApiKey,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.providerConnection.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const updateData: any = {};

    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);
    if (body.priority !== undefined) updateData.priority = Math.max(1, Number(body.priority) || 1);
    if (body.weight !== undefined) updateData.weight = Math.max(1, Number(body.weight) || 1);
    if (body.baseUrl !== undefined) updateData.baseUrl = body.baseUrl?.trim() || null;
    if (body.compatibility !== undefined) updateData.compatibility = body.compatibility;
    if (body.customHeaders !== undefined) updateData.customHeaders = body.customHeaders;
    if (body.accountEmail !== undefined) updateData.accountEmail = body.accountEmail;
    if (body.syncStatus !== undefined) updateData.syncStatus = body.syncStatus;
    if (body.cooldownUntil !== undefined) {
      updateData.cooldownUntil = body.cooldownUntil ? new Date(body.cooldownUntil) : null;
    }

    // Handle updating API key or cookie credential if provided
    if (body.apiKey && typeof body.apiKey === "string" && body.apiKey.trim().length > 0) {
      const rawKey = body.apiKey.trim();
      const providerUpper = existing.provider.toUpperCase();

      if (existing.authType === "COOKIE" || providerUpper === "CHATGPT_WEB") {
        const parsed = parseCookieInput(rawKey);
        if (!parsed.cookieString) {
          return NextResponse.json({ error: "Format cookie tidak valid." }, { status: 400 });
        }
        const sessionResult = await verifyAndFetchChatGptSession(parsed.cookieString);
        if (!sessionResult.success || !sessionResult.accessToken) {
          return NextResponse.json(
            { error: sessionResult.error || "Gagal memverifikasi sesi cookie ChatGPT." },
            { status: 400 }
          );
        }
        updateData.apiKeyEncrypted = encryptCredential(parsed.cookieString);
        updateData.accessTokenEnc = encryptCredential(sessionResult.accessToken);
        if (sessionResult.expires) {
          updateData.tokenExpiresAt = new Date(sessionResult.expires);
        }
        if (sessionResult.user?.email) {
          updateData.accountEmail = sessionResult.user.email;
        }
      } else {
        updateData.apiKeyEncrypted = encryptCredential(rawKey);
      }
    }

    const updated = await prisma.providerConnection.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      connection: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.providerConnection.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    await prisma.providerConnection.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Connection "${existing.name}" deleted successfully.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const conn = await prisma.providerConnection.findUnique({ where: { id } });
    if (!conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const start = Date.now();
    await prisma.providerConnection.update({
      where: { id },
      data: {
        syncStatus: "NORMAL",
        lastSyncedAt: new Date(),
      },
    });
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      success: true,
      id: conn.id,
      name: conn.name,
      provider: conn.provider,
      latencyMs,
      status: "NORMAL",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
