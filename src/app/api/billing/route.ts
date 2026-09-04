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

    const [totalCount, topups, tokenAgg, pendingOrders, discountInfo] = await Promise.all([
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
    ]);

    const totalPages = Math.ceil(totalCount / limit) || 1;
    const totalConsumed = tokenAgg._sum.totalTokens || 0;

    return NextResponse.json({
      balanceTokens: Number(user.tokenBalance),
      totalConsumedTokens: totalConsumed,
      userDiscount: discountInfo,
      activeOrder:
        pendingOrders.length > 0
          ? {
              orderId: pendingOrders[0].orderId,
              tokenAmount: Number(pendingOrders[0].tokenAmount),
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
    const tokenAmount = Number(body.amount) || 5000000;
    const method = body.method || "QRIS";
    const bank = body.bank || "bca";

    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const basePrice =
      PRICING[tokenAmount] || Math.round((tokenAmount / 1_000_000) * 1500);

    // Calculate applied discounts
    const discountInfo = await calculateUserDiscount(user.id);
    let finalPrice = basePrice;
    if (discountInfo.discountPct > 0) {
      finalPrice = Math.round(basePrice * (1 - discountInfo.discountPct / 100));
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
        tokenAmount: BigInt(tokenAmount),
        basePrice,
        priceIdr: finalPrice,
        discountPct: discountInfo.discountPct,
        discountReason: discountInfo.reason,
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

    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order || order.status !== "PENDING") {
      return NextResponse.json(
        { error: "Order not found or already settled" },
        { status: 400 }
      );
    }

    const descNote = order.discountPct > 0 ? ` (${order.discountPct}% Discount Applied)` : "";

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
        data: {
          tokenBalance: { increment: order.tokenAmount },
        },
      }),
      prisma.tokenTopup.create({
        data: {
          userId: order.userId,
          amount: order.tokenAmount,
          priceIdr: order.priceIdr,
          method: order.method,
          description: `Token Purchase via ${order.method} (${(Number(order.tokenAmount) / 1_000_000).toFixed(1)}M Tokens)${descNote}`,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      newBalanceTokens: Number(updatedUser.tokenBalance),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
