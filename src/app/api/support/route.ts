import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Helper function to dispatch Discord Webhook notification asynchronously
async function sendDiscordNotification(ticket: any, user: any, isFollowUp: boolean = false) {
  try {
    const config = await prisma.systemSetting.findUnique({
      where: { id: "global_config" },
      select: { discordWebhookUrl: true },
    });

    const webhookUrl = config?.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl || !webhookUrl.startsWith("http")) return;

    const embed = {
      title: isFollowUp ? "💬 Ticket Follow-Up Message" : "🎫 New Support Ticket Received!",
      color: isFollowUp ? 0x10b981 : 0x2563eb,
      fields: [
        { name: "User", value: `${user.name || "User"} (${user.email})`, inline: true },
        { name: "Category", value: ticket.category || "General", inline: true },
        { name: "Subject", value: ticket.subject || "Support Inquiry", inline: false },
        {
          name: isFollowUp ? "New Message" : "Message",
          value: ticket.message.length > 500 ? ticket.message.substring(0, 500) + "..." : ticket.message,
          inline: false,
        },
        { name: "Ticket ID", value: ticket.id, inline: true },
        { name: "Status", value: ticket.status || "OPEN", inline: true },
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

// GET user's submitted tickets with message history
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tickets = await prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
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
        messages: {
          create: {
            senderId: user.id,
            senderRole: "USER",
            senderName: user.name || user.email.split("@")[0],
            message: message.trim(),
          },
        },
      },
      include: {
        messages: true,
      },
    });

    // Fire and forget Discord webhook notification
    sendDiscordNotification(ticket, user, false).catch(() => {});

    return NextResponse.json({ success: true, data: ticket });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT user reply to existing ticket or update status (Close/Reopen)
export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { ticketId, message, status } = body;

    if (!ticketId) {
      return NextResponse.json({ error: "Ticket ID is required" }, { status: 400 });
    }

    const existingTicket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!existingTicket || existingTicket.userId !== user.id) {
      return NextResponse.json({ error: "Ticket not found or unauthorized" }, { status: 404 });
    }

    // If a new message is provided, create TicketMessage
    if (message && message.trim()) {
      await prisma.ticketMessage.create({
        data: {
          ticketId,
          senderId: user.id,
          senderRole: "USER",
          senderName: user.name || user.email.split("@")[0],
          message: message.trim(),
        },
      });

      sendDiscordNotification({ ...existingTicket, message: message.trim() }, user, true).catch(() => {});
    }

    // Reopen ticket if closed, or apply new status
    const newStatus = status || (existingTicket.status === "CLOSED" || existingTicket.status === "RESOLVED" ? "OPEN" : existingTicket.status);

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: newStatus,
        updatedAt: new Date(),
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
