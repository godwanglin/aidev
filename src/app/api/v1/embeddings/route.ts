import { NextRequest } from "next/server";
import { handleEmbeddings } from "@/sse/handlers/embeddings";

export async function POST(request: NextRequest) {
  return handleEmbeddings(request);
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
