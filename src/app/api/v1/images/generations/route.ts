import { NextRequest } from "next/server";
import { handleImagesGenerations } from "@/sse/handlers/images";

export async function POST(request: NextRequest) {
  return handleImagesGenerations(request);
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
