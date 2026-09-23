import { prisma } from "@/lib/prisma";

export interface SettleOrderResult {
  success: boolean;
  alreadyPaid?: boolean;
  order: any;
  user: any;
  message?: string;
}

/**
 * Centrally settles an order, updates user credits/subscription,
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
          creditBalance: true,
          purchasedCredits: true,
          monthlyCreditsAllocated: true,
          monthlyCreditsRemaining: true,
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
  const creditsToAdd =
    order.creditAmount > BigInt(0)
      ? order.creditAmount
      : BigInt(order.priceIdr * 10);

  const userUpdateData: any = {
    tokenBalance: { increment: order.tokenAmount },
    creditBalance: { increment: creditsToAdd },
  };

  if (isSub && order.tierTarget) {
    userUpdateData.subscriptionTier = order.tierTarget.toUpperCase();
    userUpdateData.subscriptionStartedAt = new Date();
    userUpdateData.subscriptionExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    ); // 30 hari aktif
    userUpdateData.bonusRescueClaimed = false;
    userUpdateData.monthlyCreditsAllocated = creditsToAdd;
    userUpdateData.monthlyCreditsRemaining = creditsToAdd;
  } else {
    userUpdateData.purchasedCredits = { increment: creditsToAdd };
  }

  const descNote =
    order.discountPct > 0 ? ` (${order.discountPct}% Discount Applied)` : "";
  const approverNote =
    approvedBy === "ADMIN" ? " [Manual Admin Approval]" : "";

  const txDescription = isSub
    ? `Subscription Activation: ${order.tierTarget} Tier (${(
        Number(creditsToAdd) / 1000
      ).toLocaleString("id-ID")}K Credits)${approverNote}`
    : `Credits Top-Up: ${Number(creditsToAdd).toLocaleString(
        "id-ID"
      )} CR via ${paymentType || order.method}${descNote}${approverNote}`;

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
        creditBalance: true,
        purchasedCredits: true,
        monthlyCreditsAllocated: true,
        monthlyCreditsRemaining: true,
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
        : `${Number(creditsToAdd).toLocaleString("id-ID")} Credits`,
      amountIdr: order.priceIdr,
      creditAmount: Number(creditsToAdd),
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
