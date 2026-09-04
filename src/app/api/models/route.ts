import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

let cachedModels: any = null;
let modelsExpiresAt = 0;

export function invalidateModelsCache() {
  cachedModels = null;
  modelsExpiresAt = 0;
}

export async function GET() {
  try {
    const now = Date.now();
    if (cachedModels && modelsExpiresAt > now) {
      return NextResponse.json({ data: cachedModels });
    }

    const models = await prisma.aiModel.findMany({
      orderBy: { promptCost: "desc" },
    });

    cachedModels = models;
    modelsExpiresAt = now + 60000; // 1 Minute Cache

    return NextResponse.json({ data: models });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
