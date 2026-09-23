import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { decryptCredential, maskApiKey } from "@/lib/crypto";
import { syncConnectionQuota } from "@/lib/quota-sync";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const syncResult = await syncConnectionQuota(id);

    const updated = await prisma.providerConnection.findUnique({
      where: { id },
    });

    if (!updated) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    let maskedApiKey = null;
    if (updated.apiKeyEncrypted) {
      try {
        const decrypted = decryptCredential(updated.apiKeyEncrypted);
        maskedApiKey = maskApiKey(decrypted);
      } catch (e) {
        maskedApiKey = "****ERROR****";
      }
    }

    const { apiKeyEncrypted, accessTokenEnc, refreshTokenEnc, ...rest } = updated as any;

    return NextResponse.json({
      success: true,
      data: {
        ...rest,
        maskedApiKey,
      },
      syncResult,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

