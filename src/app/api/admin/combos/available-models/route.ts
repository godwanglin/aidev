import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Return all models registered in the database transparently
    const dbModels = await prisma.aiModel.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    const data = dbModels.map((m) => ({
      id: m.id,
      modelId: m.modelId,
      name: m.name,
      provider: m.provider,
      source: "database" as const,
    }));

    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
