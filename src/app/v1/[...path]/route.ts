import { NextRequest } from "next/server";
import { handleUsage } from "@/sse/handlers/usage";

export async function GET(req: NextRequest) {
  return handleUsage(req);
}

export async function POST(req: NextRequest) {
  return handleUsage(req);
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
