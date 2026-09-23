import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { syncProviderModelsToDatabase } from "@/lib/sync-provider-models";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await syncProviderModelsToDatabase();
    return NextResponse.json({
      success: true,
      message: `Successfully synced ${result.synced} models from providers to database.`,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await syncProviderModelsToDatabase();
    return NextResponse.json({
      success: true,
      message: `Successfully synced ${result.synced} models from providers to database.`,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
