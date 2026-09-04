import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMidtransSignature, getMidtransConfig } from "@/lib/midtrans";

export async function POST(req: NextRequest) {
  try {
    const notification = await req.json();

    const {
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
      transaction_status: transactionStatus,
      fraud_status: fraudStatus,
      payment_type: paymentType,
    } = notification;

    if (!orderId) {
      return NextResponse.json({ error: "Invalid notification payload" }, { status: 400 });
    }

    const midtransConfig = await getMidtransConfig();

    // Verify SHA-512 Midtrans signature with dynamic server key
    const isValid = verifyMidtransSignature(
      orderId,
      statusCode,
      grossAmount,
      signatureKey,
      midtransConfig.serverKey
    );
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const order = await prisma.order.findUnique({
      where: { orderId },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status === "PAID") {
      return NextResponse.json({ message: "Order already processed" });
    }

    // Check payment success states
    const isSuccess =
      (transactionStatus === "capture" && fraudStatus === "accept") ||
      transactionStatus === "settlement";

    if (isSuccess) {
      const descNote = order.discountPct > 0 ? ` (${order.discountPct}% Discount Applied)` : "";

      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: {
            status: "PAID",
            paidAt: new Date(),
          },
        }),
        prisma.user.update({
          where: { id: order.userId },
          data: {
            tokenBalance: { increment: order.tokenAmount },
          },
        }),
        prisma.tokenTopup.create({
          data: {
            userId: order.userId,
            amount: order.tokenAmount,
            priceIdr: order.priceIdr,
            method: paymentType ? paymentType.toUpperCase() : order.method,
            description: `Token Purchase via Midtrans (${(Number(order.tokenAmount) / 1_000_000).toFixed(1)}M Tokens)${descNote}`,
          },
        }),
      ]);

      return NextResponse.json({ success: true, message: "Payment settled and token balance credited" });
    }

    if (transactionStatus === "cancel" || transactionStatus === "deny" || transactionStatus === "expire") {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json({ success: true, message: "Order status marked as expired" });
    }

    return NextResponse.json({ status: "PENDING" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
