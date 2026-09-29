import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

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
    const tier = searchParams.get("tier")?.trim() || "ALL";
    const role = searchParams.get("role")?.trim() || "ALL";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20", 10)));
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    const where: any = {};

    if (q) {
      where.OR = [
        { email: { contains: q } },
        { name: { contains: q } },
        { id: { contains: q } },
      ];
    }

    if (tier && tier !== "ALL") {
      where.subscriptionTier = tier.toUpperCase();
    }

    if (role && role !== "ALL") {
      where.role = role.toUpperCase();
    }

    // Allowed sort fields
    const validSortFields = ["createdAt", "balanceUsd", "name", "email", "subscriptionTier"];
    const effectiveSortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";

    const [users, totalCount, statsAgg, activeSubscribersCount, adminCount, tierConfigs] =
      await Promise.all([
        prisma.user.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { [effectiveSortField]: sortOrder },
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
            subscriptionStartedAt: true,
            subscriptionExpiresAt: true,
            bonusRescueClaimed: true,
            createdAt: true,
            _count: {
              select: {
                apiKeys: true,
                orders: true,
              },
            },
          },
        }),
        prisma.user.count({ where }),
        prisma.user.aggregate({
          _sum: {
            balanceUsd: true,
          },
          _count: {
            id: true,
          },
        }),
        prisma.user.count({
          where: {
            subscriptionTier: { not: "FREE" },
          },
        }),
        prisma.user.count({
          where: {
            role: "ADMIN",
          },
        }),
        prisma.subscriptionTierConfig.findMany({
          where: { isActive: true },
          orderBy: { priceIdr: "asc" },
        }),
      ]);

    const usersMapped = users.map((u) => {
      const isExpired = u.subscriptionExpiresAt
        ? new Date(u.subscriptionExpiresAt).getTime() < Date.now()
        : false;

      return {
        id: u.id,
        email: u.email,
        name: u.name || "Tanpa Nama",
        role: u.role || "USER",
        balanceUsd: Number(u.balanceUsd || 0),
        purchasedBalanceUsd: Number(u.purchasedBalanceUsd || 0),
        monthlyBalanceAllocatedUsd: Number(u.monthlyBalanceAllocatedUsd || 0),
        monthlyBalanceRemainingUsd: Number(u.monthlyBalanceRemainingUsd || 0),
        tokenBalance: Number(u.tokenBalance || 0),
        subscriptionTier: (u.subscriptionTier || "FREE").toUpperCase(),
        subscriptionStartedAt: u.subscriptionStartedAt,
        subscriptionExpiresAt: u.subscriptionExpiresAt,
        isSubscriptionExpired: isExpired,
        bonusRescueClaimed: Boolean(u.bonusRescueClaimed),
        createdAt: u.createdAt,
        apiKeysCount: u._count.apiKeys,
        ordersCount: u._count.orders,
      };
    });

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return NextResponse.json({
      success: true,
      users: usersMapped,
      total: totalCount,
      page,
      limit,
      totalPages,
      stats: {
        totalUsers: statsAgg._count.id || 0,
        activeSubscribers: activeSubscribersCount,
        totalBalanceUsdInCirculation: Number(statsAgg._sum.balanceUsd || 0),
        totalAdmins: adminCount,
      },
      tiers: tierConfigs.map((t) => ({
        id: t.id,
        name: t.name,
        priceIdr: t.priceIdr,
        monthlyBalanceUsd: Number(t.monthlyBalanceUsd),
        rpmLimit: t.rpmLimit,
        maxKeys: t.maxKeys,
        routingPriority: t.routingPriority,
        badgeColor: t.badgeColor,
        description: t.description,
      })),
    });
  } catch (err: any) {
    console.error("GET /api/admin/users error:", err);
    return NextResponse.json({ error: err.message || "Failed to load users" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const body = await req.json();
    const { userId, action } = body;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 1. ACTION: CHANGE_TIER
    if (action === "CHANGE_TIER") {
      const { tierId, addBalance = true } = body;
      if (!tierId) {
        return NextResponse.json({ error: "Tier ID is required" }, { status: 400 });
      }

      const normalizedTier = tierId.toUpperCase();
      const tierConfig = await prisma.subscriptionTierConfig.findUnique({
        where: { id: normalizedTier },
      });

      const isFree = normalizedTier === "FREE";
      const balanceToAddUsd =
        !isFree && addBalance && tierConfig?.monthlyBalanceUsd
          ? tierConfig.monthlyBalanceUsd
          : 0;

      const userUpdateData: any = {
        subscriptionTier: normalizedTier,
        subscriptionStartedAt: new Date(),
        subscriptionExpiresAt: isFree ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
        bonusRescueClaimed: false,
      };

      if (tierConfig) {
        userUpdateData.monthlyBalanceAllocatedUsd = Number(tierConfig.monthlyBalanceUsd);
        userUpdateData.monthlyBalanceRemainingUsd = Number(tierConfig.monthlyBalanceUsd);
      } else if (isFree) {
        userUpdateData.monthlyBalanceAllocatedUsd = 0;
        userUpdateData.monthlyBalanceRemainingUsd = 0;
      }

      if (Number(balanceToAddUsd) > 0) {
        userUpdateData.balanceUsd = { increment: balanceToAddUsd };
      }

      const [updatedUser] = await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: userUpdateData,
        }),
        prisma.tokenTopup.create({
          data: {
            userId: targetUser.id,
            amount: 0,
            priceIdr: 0,
            method: "ADMIN_TIER_OVERRIDE",
            description: `Subscription Tier changed to ${tierConfig?.name || normalizedTier} by Admin (${admin.email})${
              Number(balanceToAddUsd) > 0
                ? ` (+${Number(balanceToAddUsd).toLocaleString("id-ID")} USD auto-allocated)`
                : ""
            }`,
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        message: `Berhasil mengubah tier ${targetUser.email} menjadi ${normalizedTier}`,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          subscriptionTier: updatedUser.subscriptionTier,
          balanceUsd: Number(updatedUser.balanceUsd),
          monthlyBalanceAllocatedUsd: Number(updatedUser.monthlyBalanceAllocatedUsd),
          monthlyBalanceRemainingUsd: Number(updatedUser.monthlyBalanceRemainingUsd),
          subscriptionExpiresAt: updatedUser.subscriptionExpiresAt,
        },
      });
    }

    // 2. ACTION: INJECT_BALANCE
    if (action === "INJECT_BALANCE") {
      const { amount, balanceType = "PERMANENT", reason } = body;
      const numAmount = Number(amount);

      if (isNaN(numAmount) || numAmount <= 0) {
        return NextResponse.json(
          { error: "Nominal USD harus berupa angka positif" },
          { status: 400 }
        );
      }

      const balanceUsdAmount = Number(numAmount);
      const isMonthly = balanceType === "MONTHLY";

      const userUpdateData: any = {
        balanceUsd: { increment: balanceUsdAmount },
      };

      if (isMonthly) {
        userUpdateData.monthlyBalanceRemainingUsd = { increment: balanceUsdAmount };
        userUpdateData.monthlyBalanceAllocatedUsd = { increment: balanceUsdAmount };
      } else {
        userUpdateData.purchasedBalanceUsd = { increment: balanceUsdAmount };
      }

      const [updatedUser] = await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: userUpdateData,
        }),
        prisma.tokenTopup.create({
          data: {
            userId: targetUser.id,
            amount: 0,
            priceIdr: 0,
            method: "ADMIN_INJECTION",
            description: `Admin Balance Injection: +${numAmount.toLocaleString("id-ID")} USD (${
              isMonthly ? "Kuota Bulanan" : "Saldo Permanen"
            }) oleh ${admin.email} - Alasan: ${reason || "Penyesuaian Manual"}`,
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        message: `Berhasil menginjeksikan +${numAmount.toLocaleString("id-ID")} USD ke akun ${targetUser.email}`,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          balanceUsd: Number(updatedUser.balanceUsd),
          purchasedBalanceUsd: Number(updatedUser.purchasedBalanceUsd),
          monthlyBalanceRemainingUsd: Number(updatedUser.monthlyBalanceRemainingUsd),
        },
      });
    }

    // 3. ACTION: CHANGE_ROLE
    if (action === "CHANGE_ROLE") {
      const { role } = body;
      const normalizedRole = role?.toUpperCase();

      if (normalizedRole !== "USER" && normalizedRole !== "ADMIN") {
        return NextResponse.json({ error: "Role harus berupa 'USER' atau 'ADMIN'" }, { status: 400 });
      }

      if (targetUser.email === "admin@devportal.local" && normalizedRole !== "ADMIN") {
        return NextResponse.json(
          { error: "Akun Super Admin utama (admin@devportal.local) tidak dapat di-demote" },
          { status: 400 }
        );
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { role: normalizedRole },
      });

      return NextResponse.json({
        success: true,
        message: `Berhasil mengubah role ${targetUser.email} menjadi ${normalizedRole}`,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
        },
      });
    }

    return NextResponse.json({ error: "Aksi tidak dikenali" }, { status: 400 });
  } catch (err: any) {
    console.error("PATCH /api/admin/users error:", err);
    return NextResponse.json({ error: err.message || "Failed to update user" }, { status: 500 });
  }
}
