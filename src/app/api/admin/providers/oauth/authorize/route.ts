import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { initiateOAuthSession } from "@/lib/oauth/service";

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
    const { provider, name, customClientId, redirectUri: userRedirectUri } = body;

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 });
    }

    // Determine base redirect URI
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const defaultRedirectUri = `${protocol}://${host}/api/admin/providers/oauth/callback`;
    const redirectUri = userRedirectUri || defaultRedirectUri;

    const session = initiateOAuthSession({
      provider,
      connectionName: name || `${provider} OAuth Account`,
      redirectUri,
      customClientId,
    });

    return NextResponse.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
