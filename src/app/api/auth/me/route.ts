import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null });
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tokenBalance: Number(user.tokenBalance),
      creditBalance: Number(user.creditBalance || 0),
      subscriptionTier: user.subscriptionTier || "FREE",
      subscriptionExpiresAt: user.subscriptionExpiresAt,
    },
  });
}
