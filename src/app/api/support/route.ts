import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Helper function to dispatch Discord Webhook notification asynchronously
async function sendDiscordNotification(ticket: any, user: any) {
  try {
    const config = await prisma.systemSetting.findUnique({
      where: { id: "global_config" },
      select: { discordWebhookUrl: true },
    });

    const webhookUrl = config?.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl || !webhookUrl.startsWith("http")) return;

    const embed = {
      title: "🎫 New Support Ticket Received!",
      color: 0x2563eb, // Blue
      fields: [
        { name: "User", value: `${user.name || "User"} (${user.email})`, inline: true },
        { name: "Category", value: ticket.category, inline: true },
        { name: "Subject", value: ticket.subject, inline: false },
        {
          name: "Message",
          value: ticket.message.length > 500 ? ticket.message.substring(0, 500) + "..." : ticket.message,
          inline: false,
        },
        { name: "Ticket ID", value: ticket.id, inline: true },
        { name: "Status", value: "🟡 OPEN", inline: true },
      ],
      footer: { text: "AI Gateway Support Center" },
      timestamp: new Date().toISOString(),
    };

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Support Bot",
        embeds: [embed],
      }),
    });
  } catch (err) {
    console.error("Failed to send Discord webhook:", err);
  }
}

// GET user's submitted tickets
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tickets = await prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: tickets });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST create new support ticket
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { category, subject, message } = body;

    if (!subject || !message) {
      return NextResponse.json({ error: "Subject and Message are required" }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: user.id,
        category: category || "Technical",
        subject: subject.trim(),
        message: message.trim(),
        status: "OPEN",
      },
    });

    // Fire and forget Discord webhook notification
    sendDiscordNotification(ticket, user).catch(() => {});

    return NextResponse.json({ success: true, data: ticket });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
