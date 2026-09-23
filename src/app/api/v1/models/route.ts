import { NextRequest } from "next/server";
import { handleModelsList } from "@/sse/handlers/models";

export async function GET() {
  return handleModelsList();
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
