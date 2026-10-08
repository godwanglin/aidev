import { NextResponse } from "next/server";
import { getCurrentUser, createSessionToken } from "@/lib/session";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const newToken = createSessionToken(user.id);
  const res = NextResponse.json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name },
  });

  res.cookies.set("devportal_session", newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  return res;
}
