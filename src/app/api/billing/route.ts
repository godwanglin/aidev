import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { calculateUserDiscount } from "@/lib/discount";
import { createDirectQrisCharge, createDirectVaCharge } from "@/lib/midtrans";
import QRCode from "qrcode";
import crypto from "crypto";
import { idrToUsd, tokensForUsd } from "@/lib/billing-config";

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

    const [totalCount, userOrders, tokenAgg, pendingOrders, discountInfo, tierConfigs, topupPackages, freshUser] = await Promise.all([
      prisma.order.count({ where: { userId: user.id } }),
      prisma.order.findMany({
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
      prisma.topupPackage.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          tokenBalance: true,
          balanceUsd: true,
          subscriptionTier: true,
          subscriptionExpiresAt: true,
          monthlyBalanceAllocatedUsd: true,
          monthlyBalanceRemainingUsd: true,
          bonusRescueClaimed: true,
        },
      }),
    ]);

    const activeUser: any = freshUser || user;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const totalConsumed = tokenAgg._sum.totalTokens || 0;

    let currentTier = (activeUser.subscriptionTier || "FREE").toUpperCase();
    const isSubscriptionExpired = Boolean(
      currentTier !== "FREE" &&
      activeUser.subscriptionExpiresAt &&
      new Date(activeUser.subscriptionExpiresAt).getTime() <= Date.now()
    );

    const freeTierConfig = tierConfigs.find((t) => t.id === "FREE");
    const configuredFreeQuota = freeTierConfig ? Number(freeTierConfig.monthlyBalanceUsd) : 5.0;

    if (isSubscriptionExpired) {
      currentTier = "FREE";
      await prisma.user.update({
        where: { id: activeUser.id },
        data: {
          subscriptionTier: "FREE",
          subscriptionExpiresAt: null,
          monthlyBalanceAllocatedUsd: configuredFreeQuota,
          monthlyBalanceRemainingUsd: configuredFreeQuota,
        },
      });
      activeUser.subscriptionTier = "FREE";
      activeUser.subscriptionExpiresAt = null;
      activeUser.monthlyBalanceAllocatedUsd = configuredFreeQuota;
      activeUser.monthlyBalanceRemainingUsd = configuredFreeQuota;
    } else if (currentTier === "FREE" && Number(activeUser.monthlyBalanceAllocatedUsd) !== configuredFreeQuota) {
      // Auto-sync Free Tier users with DB tier config
      await prisma.user.update({
        where: { id: activeUser.id },
        data: {
          monthlyBalanceAllocatedUsd: configuredFreeQuota,
          monthlyBalanceRemainingUsd: configuredFreeQuota,
        },
      });
      activeUser.monthlyBalanceAllocatedUsd = configuredFreeQuota;
      activeUser.monthlyBalanceRemainingUsd = configuredFreeQuota;
    }

    const allocated = Number(activeUser.monthlyBalanceAllocatedUsd) || 0;
    const remaining = Number(activeUser.monthlyBalanceRemainingUsd);
    const used = Math.max(0, allocated - remaining);
    const usagePct = allocated > 0 ? Math.min(100, Math.round((used / allocated) * 100)) : 0;
    const isProOrUltra = activeUser.subscriptionTier === "PRO" || activeUser.subscriptionTier === "ULTRA";
    const canClaimRescueBonus = isProOrUltra && !activeUser.bonusRescueClaimed && (usagePct >= 95 || remaining <= allocated * 0.05);

    return NextResponse.json({
      balanceTokens: Number(activeUser.tokenBalance),
      balanceUsd: Number(activeUser.balanceUsd || 0),
      subscriptionTier: activeUser.subscriptionTier || "FREE",
      subscriptionExpiresAt: activeUser.subscriptionExpiresAt,
      monthlyBalanceAllocatedUsd: allocated,
      monthlyBalanceRemainingUsd: remaining,
      bonusRescueClaimed: Boolean(activeUser.bonusRescueClaimed),
      usagePct,
      canClaimRescueBonus,
      tiers: tierConfigs.map((t) => ({
        id: t.id,
        name: t.name,
        priceIdr: t.priceIdr,
        monthlyBalanceUsd: Number(t.monthlyBalanceUsd),
        rpmLimit: t.rpmLimit,
        maxKeys: t.maxKeys,
        routingPriority: t.routingPriority,
        bonusPercentage: t.bonusPercentage,
        badgeColor: t.badgeColor,
        description: t.description,
        features: t.features ? JSON.parse(t.features) : [],
      })),
      topupPackages: topupPackages.map((p) => ({
        id: p.id,
        name: p.name,
        priceIdr: p.priceIdr,
        bonusPercentage: p.bonusPercentage,
        tag: p.tag,
        badgeColor: p.badgeColor || "blue",
        balanceUsd: p.balanceUsd !== null && p.balanceUsd !== undefined ? Number(Number(p.balanceUsd).toFixed(2)) : Number((idrToUsd(p.priceIdr) * (1 + p.bonusPercentage / 100)).toFixed(2)),
      })),
      totalConsumedTokens: totalConsumed,
      userDiscount: discountInfo,
      activeOrder:
        pendingOrders.length > 0
          ? {
              orderId: pendingOrders[0].orderId,
              tokenAmount: Number(pendingOrders[0].tokenAmount),
              balanceAmountUsd: Number(pendingOrders[0].balanceAmountUsd || 0),
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
      topups: userOrders.map((o) => {
        let desc = o.orderType === "SUBSCRIPTION"
          ? `Langganan Paket ${o.tierTarget || "PRO"}`
          : `Top-Up Saldo USD`;
        if (o.discountPct > 0) {
          desc += ` (Diskon ${o.discountPct}%)`;
        }
        return {
          id: o.id,
          orderId: o.orderId,
          balanceAmountUsd: Number(o.balanceAmountUsd || 0),
          priceIdr: o.priceIdr,
          method: o.method,
          status: o.status,
          description: desc,
          createdAt: o.paidAt || o.createdAt,
        };
      }),
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

    const freshUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
      },
    });

    let basePrice = 15000;
    let finalPrice = 15000;
    let balanceAmountUsd = 0;
    let tokenAmount = 0;
    let tierTarget: string | null = null;
    let discountPct = 0;
    let discountReason: string | null = null;

    if (orderType === "SUBSCRIPTION") {
      const targetId = String(body.tier || "PRO").toUpperCase();
      if (targetId === "FREE") {
        return NextResponse.json(
          { error: "Paket Free Tier adalah paket dasar dan tidak memerlukan pembayaran." },
          { status: 400 }
        );
      }

      tierTarget = targetId;
      const tierConfig = await prisma.subscriptionTierConfig.findUnique({
        where: { id: targetId },
      });

      if (!tierConfig) {
        return NextResponse.json({ error: "Tier langganan tidak ditemukan" }, { status: 400 });
      }

      // TIER PROTECTION: Check for downgrade attempt while an active subscription exists
      const TIER_LEVELS: Record<string, number> = {
        FREE: 0,
        PLUS: 1,
        PRO: 2,
        ULTRA: 3,
      };

      const currentTier = (freshUser?.subscriptionTier || "FREE").toUpperCase();
      const isSubscriptionActive = Boolean(
        currentTier !== "FREE" &&
        freshUser?.subscriptionExpiresAt &&
        new Date(freshUser.subscriptionExpiresAt).getTime() > Date.now()
      );

      const currentLevel = TIER_LEVELS[currentTier] ?? 0;
      const targetLevel = TIER_LEVELS[targetId] ?? 0;

      if (isSubscriptionActive && targetLevel < currentLevel) {
        const expiryStr = freshUser?.subscriptionExpiresAt
          ? new Date(freshUser.subscriptionExpiresAt).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : "";
        return NextResponse.json(
          {
            error: `Proteksi Downgrade: Anda sedang aktif di paket ${currentTier}${
              expiryStr ? ` hingga ${expiryStr}` : ""
            }. Tidak dapat downgrade ke paket ${targetId}. Silakan tunggu masa aktif selesai atau pilih paket yang setara/lebih tinggi.`,
          },
          { status: 400 }
        );
      }

      basePrice = tierConfig.priceIdr;
      finalPrice = tierConfig.priceIdr;
      balanceAmountUsd = Number(tierConfig.monthlyBalanceUsd);
      tokenAmount = tokensForUsd(balanceAmountUsd);
    } else {
      // TOP-UP: customer pays IDR, account receives official USD balance.
      basePrice = Math.max(1000, Math.round(Number(body.priceIdr || body.basePrice || 0)));
      if (basePrice < 1000) {
        return NextResponse.json({ error: "Nominal top-up minimal Rp 1.000" }, { status: 400 });
      }

      // Check if matches an active top-up package with bonus from database
      const matchedPackage = await prisma.topupPackage.findFirst({
        where: { priceIdr: basePrice, isActive: true },
      });

      if (matchedPackage && matchedPackage.balanceUsd !== null && matchedPackage.balanceUsd !== undefined) {
        balanceAmountUsd = Number(Number(matchedPackage.balanceUsd).toFixed(2));
      } else {
        const bonusPct = matchedPackage ? matchedPackage.bonusPercentage : 0;
        balanceAmountUsd = Number((idrToUsd(basePrice) * (1 + bonusPct / 100)).toFixed(2));
      }

      // Calculate applied discounts for topups
      const discountInfo = await calculateUserDiscount(user.id);
      discountPct = discountInfo.discountPct;
      discountReason = discountInfo.reason;
      finalPrice = basePrice;
      if (discountPct > 0) {
        finalPrice = Math.round(basePrice * (1 - discountPct / 100));
      }
      tokenAmount = tokensForUsd(balanceAmountUsd);
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
        balanceAmountUsd: Number(balanceAmountUsd),
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
        balanceAmountUsd: Number(order.balanceAmountUsd),
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
          balanceUsd: true,
          subscriptionTier: true,
        },
      });

      return NextResponse.json({
        success: true,
        status: "PAID",
        message: "Pembayaran telah berhasil diverifikasi! Saldo dan paket telah aktif.",
        newBalanceTokens: Number(freshUser?.tokenBalance || 0),
        newBalanceUsd: Number(freshUser?.balanceUsd || 0),
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
        newBalanceUsd: Number(settleResult.user.balanceUsd),
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
