import { NextRequest } from "next/server";
import { handleChat } from "@/sse/handlers/chat";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  return handleChat(request, { subPath: "responses" });
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
