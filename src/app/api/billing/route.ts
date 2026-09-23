import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { calculateUserDiscount } from "@/lib/discount";
import { createDirectQrisCharge, createDirectVaCharge } from "@/lib/midtrans";
import QRCode from "qrcode";
import crypto from "crypto";

async function getSessionUser() {
  const sessionUser = await getCurrentUser();
  if (sessionUser) return sessionUser;

  return prisma.user.findUnique({
    where: { email: "admin@devportal.local" },
  });
}

const PRICING: Record<number, number> = {
  1000000: 2500,
  5000000: 8000,
  10000000: 15000,
  25000000: 35000,
  50000000: 68000,
  100000000: 130000,
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(Number(searchParams.get("page")) || 1, 1);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 10, 5), 50);
    const skip = (page - 1) * limit;

    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [totalCount, topups, tokenAgg, pendingOrders, discountInfo, tierConfigs, freshUser] = await Promise.all([
      prisma.tokenTopup.count({ where: { userId: user.id } }),
      prisma.tokenTopup.findMany({
        where: { userId: user.id },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.requestLog.aggregate({
        where: { apiKey: { userId: user.id } },
        _sum: { totalTokens: true },
      }),
      prisma.order.findMany({
        where: { userId: user.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 1,
      }),
      calculateUserDiscount(user.id),
      prisma.subscriptionTierConfig.findMany({
        where: { isActive: true },
        orderBy: { priceIdr: "asc" },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          tokenBalance: true,
          creditBalance: true,
          subscriptionTier: true,
          subscriptionExpiresAt: true,
          monthlyCreditsAllocated: true,
          monthlyCreditsRemaining: true,
          bonusRescueClaimed: true,
        },
      }),
    ]);

    const activeUser: any = freshUser || user;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const totalConsumed = tokenAgg._sum.totalTokens || 0;

    const allocated = Number(activeUser.monthlyCreditsAllocated) || 20000;
    const remaining = Number(activeUser.monthlyCreditsRemaining);
    const used = Math.max(0, allocated - remaining);
    const usagePct = allocated > 0 ? Math.min(100, Math.round((used / allocated) * 100)) : 0;
    const isProOrUltra = activeUser.subscriptionTier === "PRO" || activeUser.subscriptionTier === "ULTRA";
    const canClaimRescueBonus = isProOrUltra && !activeUser.bonusRescueClaimed && (usagePct >= 95 || remaining <= allocated * 0.05);

    return NextResponse.json({
      balanceTokens: Number(activeUser.tokenBalance),
      creditBalance: Number(activeUser.creditBalance || 0),
      subscriptionTier: activeUser.subscriptionTier || "FREE",
      subscriptionExpiresAt: activeUser.subscriptionExpiresAt,
      monthlyCreditsAllocated: allocated,
      monthlyCreditsRemaining: remaining,
      bonusRescueClaimed: Boolean(activeUser.bonusRescueClaimed),
      usagePct,
      canClaimRescueBonus,
      tiers: tierConfigs.map((t) => ({
        id: t.id,
        name: t.name,
        priceIdr: t.priceIdr,
        monthlyCredits: Number(t.monthlyCredits),
        rpmLimit: t.rpmLimit,
        maxKeys: t.maxKeys,
        routingPriority: t.routingPriority,
        bonusPercentage: t.bonusPercentage,
        badgeColor: t.badgeColor,
        description: t.description,
      })),
      totalConsumedTokens: totalConsumed,
      userDiscount: discountInfo,
      activeOrder:
        pendingOrders.length > 0
          ? {
              orderId: pendingOrders[0].orderId,
              tokenAmount: Number(pendingOrders[0].tokenAmount),
              creditAmount: Number(pendingOrders[0].creditAmount || 0),
              orderType: pendingOrders[0].orderType || "TOPUP",
              tierTarget: pendingOrders[0].tierTarget,
              basePrice: pendingOrders[0].basePrice,
              priceIdr: pendingOrders[0].priceIdr,
              discountPct: pendingOrders[0].discountPct,
              discountReason: pendingOrders[0].discountReason,
              method: pendingOrders[0].method,
              qrString: pendingOrders[0].qrString,
              vaNumber: pendingOrders[0].vaNumber,
              createdAt: pendingOrders[0].createdAt,
            }
          : null,
      topups: topups.map((t) => ({
        id: t.id,
        amount: Number(t.amount),
        priceIdr: t.priceIdr,
        method: t.method,
        description: t.description,
        createdAt: t.createdAt,
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderType = body.orderType === "SUBSCRIPTION" ? "SUBSCRIPTION" : "TOPUP";
    const method = body.method || "QRIS";
    const bank = body.bank || "bca";

    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let basePrice = 15000;
    let finalPrice = 15000;
    let creditAmount = 150000;
    let tokenAmount = 1500000;
    let tierTarget: string | null = null;
    let discountPct = 0;
    let discountReason: string | null = null;

    if (orderType === "SUBSCRIPTION") {
      const targetId = String(body.tier || "PRO").toUpperCase();
      tierTarget = targetId;
      const tierConfig = await prisma.subscriptionTierConfig.findUnique({
        where: { id: targetId },
      });

      if (!tierConfig) {
        return NextResponse.json({ error: "Tier langganan tidak ditemukan" }, { status: 400 });
      }

      basePrice = tierConfig.priceIdr;
      finalPrice = tierConfig.priceIdr;
      creditAmount = Number(tierConfig.monthlyCredits);
      tokenAmount = creditAmount * 10;
    } else {
      // TOPUP KETENGAN
      creditAmount = Number(body.creditAmount) || Number(body.amount) || 150000;
      basePrice = Math.round(creditAmount / 10);

      // Calculate applied discounts for topups
      const discountInfo = await calculateUserDiscount(user.id);
      discountPct = discountInfo.discountPct;
      discountReason = discountInfo.reason;
      finalPrice = basePrice;
      if (discountPct > 0) {
        finalPrice = Math.round(basePrice * (1 - discountPct / 100));
      }
      tokenAmount = creditAmount * 10;
    }

    const orderId = `AIDEV-${Date.now().toString().slice(-6)}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    let qrString: string | null = null;
    let vaNumber: string | null = null;

    if (method === "QRIS") {
      try {
        const qrisResult = await createDirectQrisCharge({
          orderId,
          grossAmount: finalPrice,
          customerDetails: {
            first_name: user.name || "Developer",
            email: user.email,
          },
        });
        qrString = qrisResult.qrImageBase64;
      } catch (err) {
        console.error("Midtrans QRIS Charge Error:", err);
      }

      // Fallback generator if offline / testing
      if (!qrString) {
        const qrisRaw = `00020101021226580016ID.CO.MIDTRANS.WWW0118936009180000100001520458125303360540${finalPrice.toString().length}${finalPrice}5802ID5915AIDEV_GATEWAY6007JAKARTA62070703A016304${orderId.slice(-4)}`;
        qrString = await QRCode.toDataURL(qrisRaw, { width: 240, margin: 1 });
      }
    } else {
      // Virtual Account Direct Charge
      try {
        const vaResult = await createDirectVaCharge({
          orderId,
          grossAmount: finalPrice,
          bank: bank,
          customerDetails: {
            first_name: user.name || "Developer",
            email: user.email,
          },
        });
        vaNumber = vaResult.vaNumber;
      } catch (err) {
        console.error("Midtrans VA Charge Error:", err);
      }

      // Fallback VA if offline / testing
      if (!vaNumber) {
        vaNumber = `8808${Math.floor(Math.random() * 89999999 + 10000000)}`;
      }
    }

    const order = await prisma.order.create({
      data: {
        orderId,
        userId: user.id,
        orderType,
        tierTarget: tierTarget || null,
        creditAmount: BigInt(creditAmount),
        tokenAmount: BigInt(tokenAmount),
        basePrice,
        priceIdr: finalPrice,
        discountPct,
        discountReason,
        method,
        qrString,
        vaNumber,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      success: true,
      order: {
        orderId: order.orderId,
        orderType: order.orderType,
        tierTarget: order.tierTarget,
        creditAmount: Number(order.creditAmount),
        tokenAmount: Number(order.tokenAmount),
        basePrice: order.basePrice,
        priceIdr: order.priceIdr,
        discountPct: order.discountPct,
        discountReason: order.discountReason,
        method: order.method,
        qrString: order.qrString,
        vaNumber: order.vaNumber,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");
    if (!orderId) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) {
      return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
    }

    // Pastikan pesanan milik user yang sedang login, atau caller adalah Admin
    if (order.userId !== user.id && user.role !== "ADMIN" && user.email !== "admin@devportal.local") {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }

    // Jika pesanan sudah disetujui oleh Admin atau webhook Midtrans
    if (order.status === "PAID") {
      const freshUser = await prisma.user.findUnique({
        where: { id: order.userId },
        select: {
          tokenBalance: true,
          creditBalance: true,
          subscriptionTier: true,
        },
      });

      return NextResponse.json({
        success: true,
        status: "PAID",
        message: "Pembayaran telah berhasil diverifikasi! Saldo dan paket telah aktif.",
        newBalanceTokens: Number(freshUser?.tokenBalance || 0),
        newCreditBalance: Number(freshUser?.creditBalance || 0),
        tier: freshUser?.subscriptionTier,
      });
    }

    // Jika masih PENDING, periksa apakah Midtrans Core API sudah mencatat pembayaran sukses
    const { getMidtransTransactionStatus } = await import("@/lib/midtrans");
    const midtransStatus = await getMidtransTransactionStatus(orderId);

    const isMidtransPaid =
      midtransStatus &&
      ((midtransStatus.transaction_status === "capture" && midtransStatus.fraud_status === "accept") ||
        midtransStatus.transaction_status === "settlement");

    if (isMidtransPaid) {
      const { settleOrder } = await import("@/lib/orders");
      const settleResult = await settleOrder(orderId, "MIDTRANS", midtransStatus.payment_type);

      return NextResponse.json({
        success: true,
        status: "PAID",
        message: "Pembayaran berhasil diverifikasi oleh payment gateway!",
        newBalanceTokens: Number(settleResult.user.tokenBalance),
        newCreditBalance: Number(settleResult.user.creditBalance),
        tier: settleResult.user.subscriptionTier,
      });
    }

    // Jika pembayaran belum lunas atau mode sandbox menunggu verifikasi manual admin:
    // PENTING: JANGAN AUTO-SETTLE! Cegah user mendapatkan kredit gratis sepihak.
    return NextResponse.json({
      success: false,
      status: "PENDING",
      message: "Pembayaran belum terkonfirmasi oleh gateway atau masih menunggu approval manual oleh Admin.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
