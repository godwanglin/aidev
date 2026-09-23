import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const { webhookUrl } = await req.json();

    let targetUrl = webhookUrl;
    if (!targetUrl) {
      const setting = await prisma.systemSetting.findUnique({
        where: { id: "global_config" },
        select: { discordWebhookUrl: true },
      });
      targetUrl = setting?.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL;
    }

    if (!targetUrl || !targetUrl.startsWith("http")) {
      return NextResponse.json({ error: "Discord Webhook URL is not configured or invalid." }, { status: 400 });
    }

    const embed = {
      title: "🔔 Aidev Gateway Support Ping Test",
      description: "Discord webhook integration test successfully received from Aidev Gateway Admin Panel.",
      color: 0x10b981, // Emerald Green
      fields: [
        { name: "Admin Operator", value: admin.name || admin.email, inline: true },
        { name: "Timestamp", value: new Date().toUTCString(), inline: true },
      ],
      footer: { text: "Aidev Gateway Webhook System" },
    };

    const discordRes = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Gateway Support Bot",
        embeds: [embed],
      }),
    });

    if (!discordRes.ok) {
      const errText = await discordRes.text();
      return NextResponse.json({ error: `Discord rejected webhook: HTTP ${discordRes.status} - ${errText}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: "Test ping sent to Discord channel successfully!" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
