import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const SESSION_COOKIE = "devportal_session";

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password.trim()).digest("hex");
}

export function createSessionToken(userId: string): string {
  const data = `${userId}:${Date.now()}`;
  const sig = crypto.createHmac("sha256", "secret_gateway_sign").update(data).digest("hex");
  return Buffer.from(`${data}:${sig}`).toString("base64");
}

export function parseSessionToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64").toString("utf-8");
    const [userId, ts, sig] = raw.split(":");
    if (!userId || !ts || !sig) return null;
    const expectedSig = crypto.createHmac("sha256", "secret_gateway_sign").update(`${userId}:${ts}`).digest("hex");
    if (sig !== expectedSig) return null;
    return userId;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = parseSessionToken(token);
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, tokenBalance: true },
  });
}
