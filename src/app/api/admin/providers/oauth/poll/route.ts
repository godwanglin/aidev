import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { pollCodeBuddyOAuth } from "@/lib/oauth/service";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { provider, state, name } = body;

    if (!state) {
      return NextResponse.json({ error: "State parameter is required" }, { status: 400 });
    }

    const provUpper = (provider || "").toUpperCase();
    if (provUpper === "CODEBUDDY" || provUpper === "CODEBUDDY_INTL" || provUpper === "CBAI") {
      const pollResult = await pollCodeBuddyOAuth({ state, name });
      return NextResponse.json(pollResult);
    }

    return NextResponse.json({ error: `Polling not supported for provider ${provider}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
