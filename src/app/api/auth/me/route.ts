import { NextResponse } from "next/server";
import { getCurrentUser, createSessionToken } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  const res = NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tokenBalance: Number(user.tokenBalance),
      balanceUsd: Number(user.balanceUsd || 0),
      subscriptionTier: user.subscriptionTier || "FREE",
      subscriptionExpiresAt: user.subscriptionExpiresAt,
    },
  });

  // Rolling/sliding session renewal: active requests always extend the 30-day session
  const newToken = createSessionToken(user.id);
  res.cookies.set("devportal_session", newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  return res;
}
