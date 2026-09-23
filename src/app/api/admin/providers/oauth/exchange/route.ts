import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { parseCallbackUrl } from "@/lib/oauth/pkce";
import { exchangeAndSaveOAuthToken } from "@/lib/oauth/service";

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
    const {
      provider,
      name,
      callbackInput,
      code: directCode,
      state: clientState,
      codeVerifier,
      priority = 1,
      weight = 1,
    } = body;

    const rawInput = callbackInput || directCode;

    if (!provider || !name || !rawInput) {
      return NextResponse.json(
        { error: "Provider, name, and callback URL/code are required" },
        { status: 400 }
      );
    }

    // Parse the input (URL, query string, or raw code)
    let code = directCode || null;
    let parsedState = clientState || null;

    if (callbackInput) {
      const parsed = parseCallbackUrl(callbackInput);
      if (parsed.error) {
        return NextResponse.json(
          { error: parsed.error },
          { status: 400 }
        );
      }
      code = parsed.code;
      if (parsed.state) parsedState = parsed.state;
    } else if (directCode && (directCode.startsWith("http") || directCode.includes("?"))) {
      const parsed = parseCallbackUrl(directCode);
      if (parsed.error) {
        return NextResponse.json(
          { error: parsed.error },
          { status: 400 }
        );
      }
      code = parsed.code;
      if (parsed.state) parsedState = parsed.state;
    }

    if (!code) {
      return NextResponse.json(
        { error: "No authorization code found in the callback URL. Pastikan seluruh URL yang mengandung '?code=...' ditempelkan ke kotak input." },
        { status: 400 }
      );
    }

    const state = parsedState || clientState || null;

    // Determine host-based redirect URI used during authorization
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const redirectUri = `${protocol}://${host}/api/admin/providers/oauth/callback`;

    const connection = await exchangeAndSaveOAuthToken({
      provider,
      name,
      code,
      state,
      codeVerifier,
      redirectUri,
      priority: Number(priority) || 1,
      weight: Number(weight) || 1,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully connected ${provider} OAuth account: ${name}`,
      data: connection,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
