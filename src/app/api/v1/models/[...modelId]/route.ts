import { NextRequest } from "next/server";
import { handleModelDetail } from "@/sse/handlers/models";

export async function GET(req: NextRequest, { params }: { params: Promise<{ modelId: string[] }> }) {
  const { modelId } = await params;
  const rawId = modelId ? modelId.join("/") : "";
  return handleModelDetail(rawId);
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
