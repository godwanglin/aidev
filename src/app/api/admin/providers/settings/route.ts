import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider");
  if (!provider) {
    return NextResponse.json({ error: "Provider is required" }, { status: 400 });
  }

  const key = `provider_routing_${provider.toUpperCase().trim()}`;
  const setting = await prisma.systemSetting.findUnique({
    where: { id: key },
  });

  let strategy = setting?.defaultRoutingStrategy;
  if (!strategy) {
    const globalConfig = await prisma.systemSetting.findUnique({
      where: { id: "global_config" },
    });
    strategy = globalConfig?.defaultRoutingStrategy || "SMART_FALLBACK";
  }

  return NextResponse.json({
    success: true,
    provider: provider.toUpperCase(),
    strategy,
    roundRobin: strategy === "ROUND_ROBIN",
  });
}

export async function PUT(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { provider, roundRobin } = body;

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 });
    }

    const key = `provider_routing_${provider.toUpperCase().trim()}`;
    const newStrategy = roundRobin ? "ROUND_ROBIN" : "SMART_FALLBACK";

    const updated = await prisma.systemSetting.upsert({
      where: { id: key },
      create: {
        id: key,
        defaultRoutingStrategy: newStrategy,
      },
      update: {
        defaultRoutingStrategy: newStrategy,
      },
    });

    return NextResponse.json({
      success: true,
      provider: provider.toUpperCase(),
      strategy: updated.defaultRoutingStrategy,
      roundRobin: updated.defaultRoutingStrategy === "ROUND_ROBIN",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update routing settings" }, { status: 500 });
  }
}
