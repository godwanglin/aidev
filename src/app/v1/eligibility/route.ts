import { NextRequest } from "next/server";
import { handleEligibility } from "@/sse/handlers/eligibility";

export async function GET(req: NextRequest) {
  return handleEligibility(req);
}

export async function POST(req: NextRequest) {
  return handleEligibility(req);
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
