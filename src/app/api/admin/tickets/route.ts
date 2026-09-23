import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

// GET all tickets for Admin with full message threads
export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";

    const where: any = {};
    if (status !== "all") {
      where.status = status;
    }

    const [tickets, setting] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      prisma.systemSetting.findUnique({
        where: { id: "global_config" },
        select: { discordWebhookUrl: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: tickets,
      discordWebhookUrl: setting?.discordWebhookUrl || "",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT reply / update ticket status or save Discord webhook URL
export async function PUT(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const body = await req.json();
    const { ticketId, status, response, message, discordWebhookUrl } = body;

    // 1. Update Discord Webhook Setting if provided
    if (discordWebhookUrl !== undefined) {
      await prisma.systemSetting.upsert({
        where: { id: "global_config" },
        update: { discordWebhookUrl: discordWebhookUrl ? discordWebhookUrl.trim() : null },
        create: { id: "global_config", discordWebhookUrl: discordWebhookUrl ? discordWebhookUrl.trim() : null },
      });
    }

    // 2. Update Ticket if ticketId provided
    let updatedTicket = null;
    if (ticketId) {
      const replyContent = message || response;

      // Add new admin message to conversation thread
      if (replyContent && replyContent.trim()) {
        await prisma.ticketMessage.create({
          data: {
            ticketId,
            senderId: admin.id,
            senderRole: "ADMIN",
            senderName: admin.name || "System Admin",
            message: replyContent.trim(),
          },
        });
      }

      updatedTicket = await prisma.supportTicket.update({
        where: { id: ticketId },
        data: {
          ...(status ? { status } : {}),
          response: replyContent ? replyContent.trim() : undefined, // Maintain backwards compatibility
          updatedAt: new Date(),
        },
        include: {
          user: { select: { email: true, name: true } },
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }

    return NextResponse.json({ success: true, data: updatedTicket });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
