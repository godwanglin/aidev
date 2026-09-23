import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { settleOrder, cancelOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "ALL";
    const orderType = searchParams.get("orderType")?.trim() || "ALL";
    const method = searchParams.get("method")?.trim() || "ALL";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20", 10)));
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    const where: any = {};

    if (q) {
      where.OR = [
        { orderId: { contains: q } },
        { user: { email: { contains: q } } },
        { user: { name: { contains: q } } },
        { user: { id: { contains: q } } },
      ];
    }

    if (status && status !== "ALL") {
      where.status = status.toUpperCase();
    }

    if (orderType && orderType !== "ALL") {
      where.orderType = orderType.toUpperCase();
    }

    if (method && method !== "ALL") {
      where.method = method.toUpperCase();
    }

    const validSortFields = ["createdAt", "priceIdr", "creditAmount"];
    const effectiveSortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";

    const [orders, totalCount, totalAll, pendingCount, paidCount, revenueAgg, creditsAgg] =
      await Promise.all([
        prisma.order.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { [effectiveSortField]: sortOrder },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                subscriptionTier: true,
                creditBalance: true,
              },
            },
          },
        }),
        prisma.order.count({ where }),
        prisma.order.count(),
        prisma.order.count({ where: { status: "PENDING" } }),
        prisma.order.count({ where: { status: "PAID" } }),
        prisma.order.aggregate({
          where: { status: "PAID" },
          _sum: { priceIdr: true },
        }),
        prisma.order.aggregate({
          where: { status: "PAID" },
          _sum: { creditAmount: true },
        }),
      ]);

    const formattedOrders = orders.map((o) => ({
      id: o.id,
      orderId: o.orderId,
      userId: o.userId,
      tokenAmount: Number(o.tokenAmount),
      creditAmount: Number(o.creditAmount),
      orderType: o.orderType,
      tierTarget: o.tierTarget,
      basePrice: o.basePrice,
      priceIdr: o.priceIdr,
      discountPct: o.discountPct,
      discountReason: o.discountReason,
      method: o.method,
      status: o.status,
      qrString: o.qrString,
      vaNumber: o.vaNumber,
      createdAt: o.createdAt.toISOString(),
      paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      user: o.user
        ? {
            id: o.user.id,
            email: o.user.email,
            name: o.user.name,
            role: o.user.role,
            subscriptionTier: o.user.subscriptionTier,
            creditBalance: Number(o.user.creditBalance),
          }
        : null,
    }));

    return NextResponse.json({
      success: true,
      orders: formattedOrders,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 1,
      stats: {
        totalOrders: totalAll,
        pendingOrders: pendingCount,
        paidOrders: paidCount,
        totalRevenueIdr: revenueAgg._sum.priceIdr || 0,
        totalCreditsIssued: Number(creditsAgg._sum.creditAmount || 0),
      },
    });
  } catch (err: any) {
    console.error("GET /api/admin/orders error:", err);
    return NextResponse.json(
      { error: err.message || "Gagal memuat daftar pesanan" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { orderId, action, reason } = body;

    if (!orderId) {
      return NextResponse.json({ error: "orderId wajib diisi" }, { status: 400 });
    }

    if (action === "APPROVE") {
      const result = await settleOrder(orderId, "ADMIN");
      return NextResponse.json({
        success: true,
        message: result.message || "Pesanan berhasil disetujui & kredit/tier berhasil diinjeksi!",
        order: {
          id: result.order.id,
          orderId: result.order.orderId,
          status: result.order.status,
          paidAt: result.order.paidAt,
        },
      });
    }

    if (action === "CANCEL") {
      const result = await cancelOrder(orderId, reason);
      return NextResponse.json({
        success: true,
        message: result.message || "Pesanan berhasil dibatalkan.",
        order: {
          id: result.order.id,
          orderId: result.order.orderId,
          status: result.order.status,
        },
      });
    }

    return NextResponse.json({ error: "Aksi tidak dikenali. Gunakan APPROVE atau CANCEL." }, { status: 400 });
  } catch (err: any) {
    console.error("PATCH /api/admin/orders error:", err);
    return NextResponse.json(
      { error: err.message || "Gagal memperbarui status pesanan" },
      { status: 500 }
    );
  }
}
