import { prisma } from "./prisma";

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}

/**
 * Sends a raw Discord webhook payload
 */
export async function sendDiscordPayload(webhookUrl: string, payload: { content?: string; embeds: DiscordEmbed[] }): Promise<boolean> {
  if (!webhookUrl || !webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    return false;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error("[Discord Webhook Error]", err);
    return false;
  }
}

/**
 * Helper to fetch system discord settings
 */
async function getDiscordSettings() {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { id: "global_config" },
      select: {
        discordWebhookUrl: true,
        discordAlertMoneyIn: true,
        discordAlertProviderDown: true,
        discordAlertSupportTicket: true,
        discordAlertLowBalance: true,
      },
    });
    return setting;
  } catch {
    return null;
  }
}

/**
 * Event 1: Money In (Midtrans Topup or Subscription) - GREEN (0x10b981)
 */
export async function sendMoneyInAlert(data: {
  userEmail: string;
  type: "TOPUP" | "SUBSCRIPTION";
  tierOrPackName: string;
  amountIdr: number;
  creditAmount: number;
  orderId: string;
  method?: string;
}) {
  const setting = await getDiscordSettings();
  if (!setting?.discordWebhookUrl || !setting.discordAlertMoneyIn) return false;

  const embed: DiscordEmbed = {
    title: "💰 Pembayaran Sukses Diterima!",
    description: `Transaksi baru berhasil diselesaikan oleh **${data.userEmail}**.`,
    color: 0x10b981, // Emerald Green
    fields: [
      { name: "Tipe Pembayaran", value: data.type === "SUBSCRIPTION" ? "🌟 Subscription" : "🪙 Top-up Ketengan", inline: true },
      { name: "Paket / Tier", value: `**${data.tierOrPackName}**`, inline: true },
      { name: "Nominal Masuk", value: `**Rp ${data.amountIdr.toLocaleString("id-ID")}**`, inline: true },
      { name: "Credits Masuk", value: `+${data.creditAmount.toLocaleString("id-ID")} CR`, inline: true },
      { name: "Metode", value: data.method || "QRIS", inline: true },
      { name: "Order ID", value: `\`${data.orderId}\``, inline: true },
    ],
    footer: { text: "AI Gateway Revenue Engine" },
    timestamp: new Date().toISOString(),
  };

  return sendDiscordPayload(setting.discordWebhookUrl, { embeds: [embed] });
}

/**
 * Event 2: Provider Down / Quota Exhausted - RED (0xef4444)
 */
export async function sendProviderDownAlert(data: {
  connectionName: string;
  provider: string;
  accountEmail?: string | null;
  statusCode: number;
  reason: string;
}) {
  const setting = await getDiscordSettings();
  if (!setting?.discordWebhookUrl || !setting.discordAlertProviderDown) return false;

  const embed: DiscordEmbed = {
    title: "🚨 Peringatan: Provider Upstream Dinonaktifkan Otomatis!",
    description: `Sistem mendeteksi kegagalan pada akun upstream dan **otomatis menonaktifkannya** dari rotasi routing router.`,
    color: 0xef4444, // Red
    fields: [
      { name: "Koneksi", value: `**${data.connectionName}**`, inline: true },
      { name: "Provider", value: data.provider, inline: true },
      { name: "Akun Email", value: data.accountEmail || "N/A", inline: true },
      { name: "HTTP Status", value: `\`${data.statusCode}\``, inline: true },
      { name: "Diagnosa / Alasan", value: data.reason, inline: false },
    ],
    footer: { text: "Automated Health Monitor Alert" },
    timestamp: new Date().toISOString(),
  };

  return sendDiscordPayload(setting.discordWebhookUrl, { embeds: [embed] });
}

/**
 * Event 3: Support Ticket Baru - YELLOW (0xf59e0b)
 */
export async function sendSupportTicketAlert(data: {
  userEmail: string;
  category: string;
  subject: string;
  messagePreview: string;
  ticketId: string;
}) {
  const setting = await getDiscordSettings();
  if (!setting?.discordWebhookUrl || !setting.discordAlertSupportTicket) return false;

  const embed: DiscordEmbed = {
    title: "🎫 Tiket Bantuan Baru Masuk",
    description: `User **${data.userEmail}** mengirimkan tiket bantuan baru.`,
    color: 0xf59e0b, // Amber / Yellow
    fields: [
      { name: "Kategori", value: data.category, inline: true },
      { name: "Subjek", value: `**${data.subject}**`, inline: true },
      { name: "Pesan", value: data.messagePreview.length > 200 ? data.messagePreview.slice(0, 197) + "..." : data.messagePreview, inline: false },
    ],
    footer: { text: "DevPortal Customer Support Desk" },
    timestamp: new Date().toISOString(),
  };

  return sendDiscordPayload(setting.discordWebhookUrl, { embeds: [embed] });
}

/**
 * Event 4: Saldo Menipis (<10%) - BLUE (0x3b82f6)
 */
export async function sendLowBalanceAlert(data: {
  userEmail: string;
  remainingCredits: number;
  tier: string;
}) {
  const setting = await getDiscordSettings();
  if (!setting?.discordWebhookUrl || !setting.discordAlertLowBalance) return false;

  const embed: DiscordEmbed = {
    title: "⚠️ Saldo Pengguna Menipis (< 10%)",
    description: `Pengguna **${data.userEmail}** memiliki sisa saldo di bawah 10%.`,
    color: 0x3b82f6, // Blue
    fields: [
      { name: "Tier Akun", value: data.tier, inline: true },
      { name: "Sisa Saldo", value: `**${data.remainingCredits.toLocaleString("id-ID")} CR**`, inline: true },
    ],
    footer: { text: "AI Gateway Usage Monitor" },
    timestamp: new Date().toISOString(),
  };

  return sendDiscordPayload(setting.discordWebhookUrl, { embeds: [embed] });
}
