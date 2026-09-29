import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

import { invalidateModelsCache } from "@/lib/models-cache";
import { resolveComboContextWindow } from "@/lib/model-capabilities";

export const dynamic = "force-dynamic";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

export async function GET() {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const [tiers, topupPackages, models, combos, settings, connections] = await Promise.all([
      prisma.subscriptionTierConfig.findMany({
        orderBy: { priceIdr: "asc" },
      }),
      prisma.topupPackage.findMany({
        orderBy: { sortOrder: "asc" },
      }),
      prisma.aiModel.findMany({
        where: { isActive: true },
        orderBy: [{ provider: "asc" }, { modelId: "asc" }],
      }),
      prisma.comboModel.findMany({
        where: { isActive: true },
        include: {
          items: {
            where: { isActive: true },
            orderBy: { priority: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.systemSetting.findUnique({
        where: { id: "global_config" },
      }),
      prisma.providerConnection.findMany({
        select: {
          id: true,
          name: true,
          provider: true,
          isActive: true,
          syncStatus: true,
          lastSyncedAt: true,
        },
      }),
    ]);

    const rawMap = new Map(models.map((m) => [m.modelId, m.contextWindow]));
    const comboModelsMapped = combos.map((c) => {
      const firstItem = c.items[0]?.modelId || "";
      const rawContext = rawMap.get(firstItem);
      const contextWindow = resolveComboContextWindow(firstItem, rawContext, c.comboId);

      return {
        id: c.id,
        modelId: c.comboId,
        name: c.name,
        provider: "COMBO",
        contextWindow,
        rateInUsdPer1m: c.rateInUsdPer1m ? Number(c.rateInUsdPer1m) : (c.rateInUsdPer1k ? Number(c.rateInUsdPer1k) * 1000 : 0.15),
        rateOutUsdPer1m: c.rateOutUsdPer1m ? Number(c.rateOutUsdPer1m) : (c.rateOutUsdPer1k ? Number(c.rateOutUsdPer1k) * 1000 : 0.60),
        rateInUsdPer1k: c.rateInUsdPer1k ? Number(c.rateInUsdPer1k) : 0.00015,
        rateOutUsdPer1k: c.rateOutUsdPer1k ? Number(c.rateOutUsdPer1k) : 0.0006,
      };
    });

    const rawModelsMapped = models.map((m) => ({
      id: m.id,
      modelId: m.modelId,
      name: m.name,
      provider: m.provider,
      contextWindow: m.contextWindow,
      isCombo: false,
      rateInUsdPer1m: 0.15,
      rateOutUsdPer1m: 0.60,
      rateInUsdPer1k: 0.00015,
      rateOutUsdPer1k: 0.0006,
    }));

    return NextResponse.json({
      success: true,
      tiers: tiers.map((t) => ({
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
        allowedModelIds: JSON.parse(t.allowedModelIds || "[]"),
        isActive: t.isActive,
      })),
      topupPackages: topupPackages.map((p) => ({
        id: p.id,
        name: p.name,
        priceIdr: p.priceIdr,
        balanceUsd: Number(p.balanceUsd || 1),
        bonusPercentage: p.bonusPercentage,
        tag: p.tag,
        badgeColor: p.badgeColor || "blue",
        sortOrder: p.sortOrder,
        isActive: p.isActive,
      })),
      models: [...comboModelsMapped, ...rawModelsMapped],
      settings: {
        discordWebhookUrl: settings?.discordWebhookUrl || "",
        discordAlertMoneyIn: settings?.discordAlertMoneyIn ?? true,
        discordAlertProviderDown: settings?.discordAlertProviderDown ?? true,
        discordAlertSupportTicket: settings?.discordAlertSupportTicket ?? true,
        discordAlertLowBalance: settings?.discordAlertLowBalance ?? true,
        healthCheckIntervalMinutes: settings?.healthCheckIntervalMinutes || 10,
      },
      connections,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const body = await req.json();

    // 1. Update Tier Model Access Matrix
    if (body.action === "update_tier_models") {
      const { tierId, allowedModelIds } = body;
      if (!tierId || !Array.isArray(allowedModelIds)) {
        return NextResponse.json({ error: "Invalid tier or model array" }, { status: 400 });
      }

      await prisma.subscriptionTierConfig.update({
        where: { id: tierId },
        data: {
          allowedModelIds: JSON.stringify(allowedModelIds),
        },
      });

      invalidateModelsCache();

      return NextResponse.json({
        success: true,
        message: `Model access list for tier ${tierId} updated successfully.`,
      });
    }

    // 2. Update Tier Parameters (Pricing, USD, Limits, Features, Active)
    if (body.action === "update_tier_config") {
      const {
        tierId,
        name,
        priceIdr,
        monthlyBalanceUsd,
        rpmLimit,
        maxKeys,
        routingPriority,
        bonusPercentage,
        badgeColor,
        description,
        features,
        isActive,
      } = body;

      if (!tierId) {
        return NextResponse.json({ error: "tierId is required" }, { status: 400 });
      }

      await prisma.subscriptionTierConfig.update({
        where: { id: tierId },
        data: {
          ...(name !== undefined && { name: String(name) }),
          ...(priceIdr !== undefined && { priceIdr: Number(priceIdr) }),
          ...(monthlyBalanceUsd !== undefined && { monthlyBalanceUsd: Number(monthlyBalanceUsd) }),
          ...(rpmLimit !== undefined && { rpmLimit: Number(rpmLimit) }),
          ...(maxKeys !== undefined && { maxKeys: Number(maxKeys) }),
          ...(routingPriority !== undefined && { routingPriority: String(routingPriority) }),
          ...(bonusPercentage !== undefined && { bonusPercentage: Number(bonusPercentage) }),
          ...(badgeColor !== undefined && { badgeColor: String(badgeColor) }),
          ...(description !== undefined && { description: String(description) }),
          ...(features !== undefined && {
            features: Array.isArray(features) ? JSON.stringify(features) : String(features),
          }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Tier ${tierId} berhasil diperbarui.`,
      });
    }

    // 3. Create New Tier
    if (body.action === "create_tier") {
      const {
        id,
        name,
        priceIdr,
        monthlyBalanceUsd,
        rpmLimit,
        maxKeys,
        routingPriority,
        bonusPercentage,
        badgeColor,
        description,
        features,
        allowedModelIds,
        isActive,
      } = body;

      const cleanId = String(id || "").trim().toUpperCase();
      if (!cleanId) {
        return NextResponse.json({ error: "ID Tier wajib diisi (misal VIP, ENTERPRISE)" }, { status: 400 });
      }

      const existing = await prisma.subscriptionTierConfig.findUnique({
        where: { id: cleanId },
      });
      if (existing) {
        return NextResponse.json({ error: `Tier dengan ID ${cleanId} sudah ada` }, { status: 400 });
      }

      await prisma.subscriptionTierConfig.create({
        data: {
          id: cleanId,
          name: String(name || cleanId),
          priceIdr: Number(priceIdr || 0),
          monthlyBalanceUsd: Number(monthlyBalanceUsd || 1),
          rpmLimit: Number(rpmLimit || 15),
          maxKeys: Number(maxKeys || 2),
          routingPriority: String(routingPriority || "REGULAR"),
          bonusPercentage: Number(bonusPercentage || 0),
          badgeColor: String(badgeColor || "blue"),
          description: String(description || ""),
          features: Array.isArray(features) ? JSON.stringify(features) : "[]",
          allowedModelIds: Array.isArray(allowedModelIds) ? JSON.stringify(allowedModelIds) : "[]",
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Tier baru ${cleanId} berhasil dibuat.`,
      });
    }

    // 4. Delete Tier
    if (body.action === "delete_tier") {
      const { tierId } = body;
      if (!tierId) {
        return NextResponse.json({ error: "tierId is required" }, { status: 400 });
      }
      if (["FREE", "PLUS", "PRO", "ULTRA"].includes(tierId.toUpperCase())) {
        return NextResponse.json({ error: "Tier sistem inti tidak boleh dihapus, silakan nonaktifkan saja." }, { status: 400 });
      }

      await prisma.subscriptionTierConfig.delete({
        where: { id: tierId },
      });

      return NextResponse.json({
        success: true,
        message: `Tier ${tierId} berhasil dihapus.`,
      });
    }

    // 5. Create Top-Up Package (Ketengan)
    if (body.action === "create_topup_package") {
      const { name, priceIdr, balanceUsd, bonusPercentage, tag, badgeColor, sortOrder, isActive } = body;

      if (!name || !priceIdr) {
        return NextResponse.json({ error: "Nama dan Harga paket wajib diisi" }, { status: 400 });
      }

      const created = await prisma.topupPackage.create({
        data: {
          name: String(name).trim(),
          priceIdr: Number(priceIdr),
          balanceUsd: Number(balanceUsd || 1),
          bonusPercentage: Number(bonusPercentage || 0),
          tag: tag ? String(tag).trim() : null,
          badgeColor: String(badgeColor || "blue"),
          sortOrder: Number(sortOrder || 0),
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Paket ketengan ${created.name} berhasil dibuat.`,
        package: created,
      });
    }

    // 6. Update Top-Up Package (Ketengan)
    if (body.action === "update_topup_package") {
      const { id, name, priceIdr, balanceUsd, bonusPercentage, tag, badgeColor, sortOrder, isActive } = body;

      if (!id) {
        return NextResponse.json({ error: "ID paket wajib diisi" }, { status: 400 });
      }

      const updated = await prisma.topupPackage.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: String(name).trim() }),
          ...(priceIdr !== undefined && { priceIdr: Number(priceIdr) }),
          ...(balanceUsd !== undefined && { balanceUsd: Number(balanceUsd) }),
          ...(bonusPercentage !== undefined && { bonusPercentage: Number(bonusPercentage) }),
          ...(tag !== undefined && { tag: tag ? String(tag).trim() : null }),
          ...(badgeColor !== undefined && { badgeColor: String(badgeColor) }),
          ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Paket ketengan ${updated.name} berhasil diperbarui.`,
        package: updated,
      });
    }

    // 7. Delete Top-Up Package (Ketengan)
    if (body.action === "delete_topup_package") {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ error: "ID paket wajib diisi" }, { status: 400 });
      }

      await prisma.topupPackage.delete({
        where: { id },
      });

      return NextResponse.json({
        success: true,
        message: "Paket ketengan berhasil dihapus.",
      });
    }

    // 8. Update Discord Settings
    if (body.action === "update_discord_settings") {
      const {
        discordWebhookUrl,
        discordAlertMoneyIn,
        discordAlertProviderDown,
        discordAlertSupportTicket,
        discordAlertLowBalance,
        healthCheckIntervalMinutes,
      } = body;

      await prisma.systemSetting.upsert({
        where: { id: "global_config" },
        update: {
          discordWebhookUrl,
          discordAlertMoneyIn: Boolean(discordAlertMoneyIn),
          discordAlertProviderDown: Boolean(discordAlertProviderDown),
          discordAlertSupportTicket: Boolean(discordAlertSupportTicket),
          discordAlertLowBalance: Boolean(discordAlertLowBalance),
          healthCheckIntervalMinutes: Number(healthCheckIntervalMinutes) || 10,
        },
        create: {
          id: "global_config",
          discordWebhookUrl,
          discordAlertMoneyIn: Boolean(discordAlertMoneyIn),
          discordAlertProviderDown: Boolean(discordAlertProviderDown),
          discordAlertSupportTicket: Boolean(discordAlertSupportTicket),
          discordAlertLowBalance: Boolean(discordAlertLowBalance),
          healthCheckIntervalMinutes: Number(healthCheckIntervalMinutes) || 10,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Discord notification settings saved successfully.",
      });
    }

    // 9. Test Discord Webhook
    if (body.action === "test_discord_webhook") {
      const url = body.webhookUrl;
      const { sendDiscordPayload } = await import("@/lib/discord");
      const ok = await sendDiscordPayload(url, {
        embeds: [
          {
            title: "🔔 Test Alert: AI Gateway Connected!",
            description: "Discord webhook integration aktif dan berhasil terhubung dengan Gateway.",
            color: 0x2563eb, // Blue
            fields: [
              { name: "Status", value: "✅ Online & Siap Menerima Notifikasi", inline: true },
              { name: "Server Time", value: new Date().toLocaleString("id-ID"), inline: true },
            ],
            footer: { text: "AI Gateway Notifier Engine" },
            timestamp: new Date().toISOString(),
          },
        ],
      });

      if (ok) {
        return NextResponse.json({ success: true, message: "Pesan tes berhasil dikirim ke Discord!" });
      } else {
        return NextResponse.json({ error: "Gagal mengirim webhook. Pastikan URL Discord valid." }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
