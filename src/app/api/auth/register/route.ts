import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSessionToken } from "@/lib/session";
import { verifyCaptchaToken } from "../captcha/route";

// In-memory registration rate limiter by IP
const regAttemptsByIp = new Map<string, number[]>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      email,
      password,
      name,
      captchaAnswer,
      captchaToken,
      honeypot, // Hidden bot trap field
      renderTimestamp,
    } = body;

    // 1. Honeypot check: If filled by automated bot, reject immediately
    if (honeypot) {
      return NextResponse.json({ error: "Bot activity detected." }, { status: 400 });
    }

    // 2. Minimum form fill time check (bots submit in < 800ms)
    if (renderTimestamp && Date.now() - Number(renderTimestamp) < 800) {
      return NextResponse.json(
        { error: "Submission too fast. Please humanly review the form." },
        { status: 400 }
      );
    }

    // 3. CAPTCHA verification
    if (!captchaToken || captchaAnswer === undefined || captchaAnswer === "") {
      return NextResponse.json(
        { error: "Please solve the anti-bot security challenge." },
        { status: 400 }
      );
    }

    const isCaptchaValid = verifyCaptchaToken(captchaToken, captchaAnswer);
    if (!isCaptchaValid) {
      return NextResponse.json(
        { error: "Incorrect security challenge answer. Please try again." },
        { status: 400 }
      );
    }

    // 4. IP-based Registration Throttling (Max 5 accounts per IP per hour)
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const ipTimestamps = (regAttemptsByIp.get(clientIp) || []).filter(
      (t) => now - t < oneHour
    );

    if (ipTimestamps.length >= 5) {
      return NextResponse.json(
        { error: "Registration limit reached from your IP. Please try again later." },
        { status: 429 }
      );
    }

    // 5. Normal Registration Flow
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        name: name || normalizedEmail.split("@")[0],
        tokenBalance: BigInt(10000000), // 10M token starter package
      },
    });

    ipTimestamps.push(now);
    regAttemptsByIp.set(clientIp, ipTimestamps);

    const token = createSessionToken(user.id);
    const res = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
    });

    res.cookies.set("devportal_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
