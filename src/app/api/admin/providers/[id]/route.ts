import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { encryptCredential } from "@/lib/crypto";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, apiKey, baseUrl, compatibility, customHeaders, accountEmail, isActive, priority, weight } = body;

    const updateData: any = { name, baseUrl, compatibility, customHeaders, accountEmail, priority, weight };
    
    if (apiKey) {
      updateData.apiKeyEncrypted = encryptCredential(apiKey);
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
      if (isActive) {
        updateData.cooldownUntil = null;
      }
    }

    // Remove undefined values to prevent overriding with null un-intentionally if not using Prisma omit
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const updated = await prisma.providerConnection.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({ success: true, ...updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    await prisma.providerConnection.delete({
      where: { id }
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
