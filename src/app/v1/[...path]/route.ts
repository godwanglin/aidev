import { NextRequest, NextResponse } from "next/server";
import { handleChat } from "@/sse/handlers/chat";
import { handleEmbeddings } from "@/sse/handlers/embeddings";
import { handleModelsList, handleModelDetail } from "@/sse/handlers/models";
import { handleEligibility } from "@/sse/handlers/eligibility";
import { handleUsage } from "@/sse/handlers/usage";

/**
 * Universal fallback catch-all for /v1/* (9router pattern).
 * Delegates requests to the unified handlers in src/sse/handlers/.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const subPath = path ? path.join("/") : "";

  if (subPath === "embeddings") {
    return handleEmbeddings(req);
  }
  if (subPath === "eligibility" || subPath === "eligibility/") {
    return handleEligibility(req);
  }
  if (subPath === "usage" || subPath === "usage/") {
    return handleUsage(req);
  }
  if (subPath === "responses" || subPath === "responses/compact") {
    return handleChat(req, { subPath: "responses" });
  }
  if (subPath === "messages") {
    return handleChat(req, { subPath: "messages" });
  }
  // Default to chat/completions for "chat/completions" or any unmapped POST
  return handleChat(req, { subPath: "chat/completions" });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const subPath = path ? path.join("/") : "";

  if (subPath === "eligibility" || subPath === "eligibility/") {
    return handleEligibility(req);
  }
  if (subPath === "usage" || subPath === "usage/") {
    return handleUsage(req);
  }
  if (subPath === "models" || subPath === "models/") {
    return handleModelsList();
  }
  if (subPath.startsWith("models/")) {
    const rawModelId = subPath.replace(/^models\//, "");
    return handleModelDetail(rawModelId);
  }
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
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
