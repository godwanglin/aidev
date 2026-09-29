import { prisma } from "@/lib/prisma";

export interface SettleOrderResult {
  success: boolean;
  alreadyPaid?: boolean;
  order: any;
  user: any;
  message?: string;
}

/**
 * Centrally settles an order, updates user balance/subscription,
 * creates TokenTopup ledger record, and sends Discord notification.
 */
export async function settleOrder(
  orderId: string,
  approvedBy: "ADMIN" | "MIDTRANS" | "SYSTEM" = "ADMIN",
  paymentType?: string
): Promise<SettleOrderResult> {
  const order = await prisma.order.findUnique({
    where: { orderId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          tokenBalance: true,
          balanceUsd: true,
          purchasedBalanceUsd: true,
          monthlyBalanceAllocatedUsd: true,
          monthlyBalanceRemainingUsd: true,
          subscriptionTier: true,
          subscriptionExpiresAt: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error(`Pesanan dengan ID ${orderId} tidak ditemukan.`);
  }

  if (order.status === "PAID") {
    return {
      success: true,
      alreadyPaid: true,
      order,
      user: order.user,
      message: "Pesanan ini sudah berstatus PAID sebelumnya.",
    };
  }

  const isSub = order.orderType === "SUBSCRIPTION";
  const balanceToAddUsd =
    Number(order.balanceAmountUsd) > 0
      ? order.balanceAmountUsd
      : 0;

  const userUpdateData: any = {
    tokenBalance: { increment: order.tokenAmount },
    balanceUsd: { increment: balanceToAddUsd },
  };

  if (isSub && order.tierTarget) {
    const targetTier = order.tierTarget.toUpperCase();
    const currentTier = (order.user.subscriptionTier || "FREE").toUpperCase();
    const currentExpiry = order.user.subscriptionExpiresAt
      ? new Date(order.user.subscriptionExpiresAt)
      : null;
    const isSameTierActive =
      currentTier === targetTier &&
      currentExpiry !== null &&
      currentExpiry.getTime() > Date.now();

    userUpdateData.subscriptionTier = targetTier;
    userUpdateData.bonusRescueClaimed = false;
    userUpdateData.monthlyBalanceAllocatedUsd = balanceToAddUsd;

    if (isSameTierActive) {
      // Perpanjangan (Renew): Tambahkan 30 hari ke sisa masa aktif yang ada
      userUpdateData.subscriptionExpiresAt = new Date(
        currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000
      );
      userUpdateData.monthlyBalanceRemainingUsd = {
        increment: balanceToAddUsd,
      };
    } else {
      // Upgrade atau aktivasi baru: Mulai 30 hari dari sekarang
      userUpdateData.subscriptionStartedAt = new Date();
      userUpdateData.subscriptionExpiresAt = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      );
      userUpdateData.monthlyBalanceRemainingUsd = balanceToAddUsd;
    }

    // Sync all existing API keys to new tier's RPM limit
    const targetTierConfig = await prisma.subscriptionTierConfig.findUnique({
      where: { id: targetTier },
    });
    if (targetTierConfig?.rpmLimit) {
      await prisma.apiKey.updateMany({
        where: { userId: order.userId },
        data: { rateLimit: targetTierConfig.rpmLimit },
      });
    }
  } else {
    userUpdateData.purchasedBalanceUsd = { increment: balanceToAddUsd };
  }

  const isRenewal =
    isSub &&
    order.tierTarget &&
    (order.user.subscriptionTier || "FREE").toUpperCase() ===
      order.tierTarget.toUpperCase();

  const descNote =
    order.discountPct > 0 ? ` (${order.discountPct}% Discount Applied)` : "";
  const approverNote =
    approvedBy === "ADMIN" ? " [Manual Admin Approval]" : "";

  const txDescription = isSub
    ? `${isRenewal ? "Subscription Renewal" : "Subscription Activation"}: ${order.tierTarget} Tier (+${Number(balanceToAddUsd).toFixed(2)} USD)${approverNote}`
    : `USD Top-Up: ${Number(balanceToAddUsd).toLocaleString(
        "id-ID"
      )} USD via ${paymentType || order.method}${descNote}${approverNote}`;

  const [updatedOrder, updatedUser] = await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
      },
    }),
    prisma.user.update({
      where: { id: order.userId },
      data: userUpdateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tokenBalance: true,
        balanceUsd: true,
        purchasedBalanceUsd: true,
        monthlyBalanceAllocatedUsd: true,
        monthlyBalanceRemainingUsd: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
      },
    }),
    prisma.tokenTopup.create({
      data: {
        userId: order.userId,
        amount: order.tokenAmount,
        priceIdr: order.priceIdr,
        method: paymentType ? paymentType.toUpperCase() : order.method,
        description: txDescription,
      },
    }),
  ]);

  // Fire-and-forget Discord Alert
  try {
    const { sendMoneyInAlert } = await import("@/lib/discord");
    sendMoneyInAlert({
      userEmail: updatedUser.email,
      type: isSub ? "SUBSCRIPTION" : "TOPUP",
      tierOrPackName: isSub
        ? `${order.tierTarget} Tier`
        : `${Number(balanceToAddUsd).toLocaleString("id-ID")} USD`,
      amountIdr: order.priceIdr,
      balanceAmountUsd: Number(balanceToAddUsd),
      orderId: order.orderId,
      method: `${order.method}${approvedBy === "ADMIN" ? " (Manual Admin)" : ""}`,
    }).catch(() => {});
  } catch (err) {
    console.error("Failed to send Money-In alert:", err);
  }

  return {
    success: true,
    order: updatedOrder,
    user: updatedUser,
    message: "Pesanan berhasil disetujui dan saldo/paket telah aktif!",
  };
}

/**
 * Cancels a pending order
 */
export async function cancelOrder(orderId: string, reason?: string) {
  const order = await prisma.order.findUnique({ where: { orderId } });
  if (!order) {
    throw new Error(`Pesanan dengan ID ${orderId} tidak ditemukan.`);
  }

  if (order.status === "PAID") {
    throw new Error("Pesanan yang sudah berstatus PAID tidak dapat dibatalkan.");
  }

  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "CANCELLED",
    },
  });

  return {
    success: true,
    order: updatedOrder,
    message: reason ? `Pesanan dibatalkan: ${reason}` : "Pesanan berhasil dibatalkan.",
  };
}
