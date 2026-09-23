import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        creditBalance: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        monthlyCreditsAllocated: true,
        monthlyCreditsRemaining: true,
        bonusRescueClaimed: true,
      },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const tier = dbUser.subscriptionTier.toUpperCase();
    if (tier !== "PRO" && tier !== "ULTRA") {
      return NextResponse.json(
        { error: "Emergency Rescue Bonus hanya tersedia untuk pelanggan paket PRO (30%) dan ULTRA (50%)." },
        { status: 400 }
      );
    }

    if (dbUser.bonusRescueClaimed) {
      return NextResponse.json(
        { error: "Bonus kuota sudah pernah diklaim untuk periode langganan ini (Maksimal 1x klaim per periode)." },
        { status: 400 }
      );
    }

    // Check if subscription has expired
    if (dbUser.subscriptionExpiresAt && new Date(dbUser.subscriptionExpiresAt) < new Date()) {
      return NextResponse.json(
        { error: "Masa aktif langganan Anda sudah berakhir. Silakan perpanjang paket untuk menikmati fitur ini." },
        { status: 400 }
      );
    }

    const allocated = Number(dbUser.monthlyCreditsAllocated) || (tier === "PRO" ? 1200000 : 3500000);
    const remaining = Number(dbUser.monthlyCreditsRemaining);
    const used = Math.max(0, allocated - remaining);
    const usageRatio = allocated > 0 ? used / allocated : 0;

    // Must reach at least 95% usage (or remaining <= 5%)
    if (usageRatio < 0.95 && remaining > allocated * 0.05) {
      const remainingForClaim = Math.round(remaining - allocated * 0.05);
      return NextResponse.json(
        {
          error: `Pemakaian kuota bulanan Anda saat ini baru ${(usageRatio * 100).toFixed(1)}%. Tombol klaim aktif setelah mencapai minimal 95% pemakaian.`,
        },
        { status: 400 }
      );
    }

    // Calculate bonus amount
    const bonusPercent = tier === "PRO" ? 30 : 50;
    const bonusCredits = Math.round((allocated * bonusPercent) / 100);

    const updated = await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        creditBalance: { increment: BigInt(bonusCredits) },
        monthlyCreditsRemaining: { increment: BigInt(bonusCredits) },
        bonusRescueClaimed: true,
      },
      select: {
        creditBalance: true,
        monthlyCreditsRemaining: true,
        bonusRescueClaimed: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Selamat! Emergency Rescue Bonus +${bonusPercent}% (+${bonusCredits.toLocaleString()} Credits) berhasil disuntikkan ke akun Anda.`,
      bonusCredits,
      newBalance: Number(updated.creditBalance),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
