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

    const [tiers, models, combos, settings, connections] = await Promise.all([
      prisma.subscriptionTierConfig.findMany({
        orderBy: { priceIdr: "asc" },
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
        isCombo: true,
        rateInPer1k: c.rateInPer1k ?? 25,
        rateOutPer1k: c.rateOutPer1k ?? 100,
      };
    });

    const rawModelsMapped = models.map((m) => ({
      id: m.id,
      modelId: m.modelId,
      name: m.name,
      provider: m.provider,
      contextWindow: m.contextWindow,
      isCombo: false,
      rateInPer1k: 25,
      rateOutPer1k: 100,
    }));

    return NextResponse.json({
      success: true,
      tiers: tiers.map((t) => ({
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
        allowedModelIds: JSON.parse(t.allowedModelIds || "[]"),
        isActive: t.isActive,
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

    // 2. Update Tier Parameters (Pricing, Credits, Limits)
    if (body.action === "update_tier_config") {
      const { tierId, priceIdr, monthlyCredits, rpmLimit, maxKeys, bonusPercentage } = body;
      if (!tierId) {
        return NextResponse.json({ error: "tierId is required" }, { status: 400 });
      }

      await prisma.subscriptionTierConfig.update({
        where: { id: tierId },
        data: {
          priceIdr: Number(priceIdr),
          monthlyCredits: BigInt(monthlyCredits),
          rpmLimit: Number(rpmLimit),
          maxKeys: Number(maxKeys),
          bonusPercentage: Number(bonusPercentage),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Tier ${tierId} configuration saved successfully.`,
      });
    }

    // 3. Update Discord Settings
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

    // 4. Test Discord Webhook
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
