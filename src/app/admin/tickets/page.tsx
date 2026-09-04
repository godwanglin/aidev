"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  LifeBuoy,
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  User,
  Filter,
  Save,
  Check,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

interface TicketItem {
  id: string;
  category: string;
  subject: string;
  message: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  response: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Selected Ticket for Reply
  const [activeTicket, setActiveTicket] = useState<TicketItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [ticketStatus, setTicketStatus] = useState<string>("IN_PROGRESS");
  const [submittingReply, setSubmittingReply] = useState(false);

  async function fetchTickets() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tickets?status=${statusFilter}`);
      const json = await res.json();
      if (json.data) {
        setTickets(json.data);
        if (json.discordWebhookUrl !== undefined) {
          setDiscordWebhookUrl(json.discordWebhookUrl);
        }
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    fetchTickets();
  }, [statusFilter]);

  async function handleSaveWebhook(e: React.FormEvent) {
    e.preventDefault();
    setSavingWebhook(true);
    try {
      const res = await fetch("/api/admin/tickets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordWebhookUrl }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg("Discord Webhook URL berhasil disimpan!");
        setTimeout(() => setSuccessMsg(""), 3000);
      }
    } catch {}
    setSavingWebhook(false);
  }

  async function handleReplyTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTicket) return;
    setSubmittingReply(true);
    try {
      const res = await fetch("/api/admin/tickets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: activeTicket.id,
          status: ticketStatus,
          response: replyText,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`Tiket #${activeTicket.id.slice(-6)} berhasil diperbarui ke ${ticketStatus}!`);
        setActiveTicket(null);
        setReplyText("");
        fetchTickets();
        setTimeout(() => setSuccessMsg(""), 3000);
      }
    } catch {}
    setSubmittingReply(false);
  }

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Admin Support & Tickets Center"
          subtitle="Kelola tiket keluhan developer, berikan balasan langsung, dan atur webhook Discord notifikasi."
        >
          <button className="control btn-inline" onClick={fetchTickets}>
            <RefreshCw size={13} strokeWidth={1.5} />
            <span>Refresh</span>
          </button>
        </PageHead>

        {successMsg && (
          <div className="banner-alert mb-3">
            <CheckCircle2 size={16} className="text-green shrink-0" />
            <div className="banner-text">
              <strong>Success!</strong>
              <p>{successMsg}</p>
            </div>
          </div>
        )}

        {/* Discord Webhook Configuration Panel */}
        <article className="panel mb-4">
          <div className="panel-title">
            <h2>
              <LifeBuoy size={14} className="text-blue" />
              <span>Discord Notification Webhook (Hybrid Integration)</span>
            </h2>
          </div>
          <form onSubmit={handleSaveWebhook} className="settings-body">
            <p className="text-xs text-muted mb-2.5">
              Setiap kali ada user mengirimkan tiket bantuan baru di <code>/support</code>, sistem akan otomatis mengirim notifikasi embed rich-card ke channel Discord tim Anda.
            </p>
            <div className="flex gap-2">
              <input
                suppressHydrationWarning
                type="url"
                className="control flex-1"
                placeholder="https://discord.com/api/webhooks/1234567890/abcdefg..."
                value={discordWebhookUrl}
                onChange={(e) => setDiscordWebhookUrl(e.target.value)}
              />
              <button type="submit" className="primary btn-inline shrink-0" disabled={savingWebhook}>
                <Save size={13} />
                <span>{savingWebhook ? "Menyimpan..." : "Simpan Webhook"}</span>
              </button>
            </div>
          </form>
        </article>

        {/* Tickets Management Grid */}
        <div className="bottom" style={{ alignItems: "flex-start" }}>
          {/* Left Table: List of Tickets */}
          <article className="panel flex-1">
            <div className="panel-title flex items-center justify-between">
              <h2>
                <MessageSquare size={14} className="text-blue" />
                <span>Daftar Tiket Developer</span>
              </h2>
              <div className="segmented">
                <button
                  className={`seg-btn ${statusFilter === "all" ? "active" : ""}`}
                  onClick={() => setStatusFilter("all")}
                >
                  Semua
                </button>
                <button
                  className={`seg-btn ${statusFilter === "OPEN" ? "active" : ""}`}
                  onClick={() => setStatusFilter("OPEN")}
                >
                  Open
                </button>
                <button
                  className={`seg-btn ${statusFilter === "RESOLVED" ? "active" : ""}`}
                  onClick={() => setStatusFilter("RESOLVED")}
                >
                  Resolved
                </button>
              </div>
            </div>

            <div className="logs-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Kategori</th>
                    <th>Subjek & Pesan</th>
                    <th>Status</th>
                    <th>Tanggal</th>
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-muted">Memuat tiket...</td>
                    </tr>
                  ) : tickets.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-muted">Tidak ada tiket dalam filter ini.</td>
                    </tr>
                  ) : (
                    tickets.map((t) => (
                      <tr key={t.id} className={activeTicket?.id === t.id ? "bg-[#f8fafc]" : ""}>
                        <td className="cell-strong" style={{ minWidth: "160px" }}>
                          <span className="block font-semibold text-ink text-xs">{t.user?.name || "User"}</span>
                          <span className="text-muted block text-[11px] font-mono mt-0.5">{t.user?.email}</span>
                        </td>
                        <td>
                          <span className="env env-preview">{t.category}</span>
                        </td>
                        <td style={{ maxWidth: "320px" }}>
                          <strong className="block text-ink text-xs mb-1">{t.subject}</strong>
                          <p className="text-muted m-0 text-[11.5px] leading-relaxed line-clamp-2">{t.message}</p>
                        </td>
                        <td>
                          <span
                            className={`status-dot ${
                              t.status === "OPEN"
                                ? "idle"
                                : t.status === "RESOLVED"
                                ? "online"
                                : "text-blue"
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="text-muted text-[11px] whitespace-nowrap">
                          {new Date(t.createdAt).toLocaleDateString()}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          <button
                            className="control btn-inline text-xs"
                            onClick={() => {
                              setActiveTicket(t);
                              setReplyText(t.response || "");
                              setTicketStatus(t.status);
                            }}
                          >
                            <span>Tinjau & Balas</span>
                            <ChevronRight size={11} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Right Column: Active Ticket Reply Panel */}
          {activeTicket ? (
            <article className="panel" style={{ width: "380px", flexShrink: 0 }}>
              <div className="panel-title flex items-center justify-between">
                <h2>
                  <span className="font-semibold">Tiket #{activeTicket.id.slice(-6)}</span>
                </h2>
                <button
                  className="btn-icon"
                  style={{ width: "22px", height: "22px", padding: 0, border: "none" }}
                  onClick={() => setActiveTicket(null)}
                  title="Tutup Panel"
                >
                  ✕
                </button>
              </div>

              <div className="p-3">
                {/* User & Ticket Summary Box with Clean Separators */}
                <div className="p-3 bg-[#f8fafc] border border-[var(--line)] rounded mb-3 text-xs flex flex-col gap-2">
                  <div className="flex items-center justify-between border-b border-[var(--line-subtle)] pb-2">
                    <span className="text-muted text-[11px]">Pengirim:</span>
                    <strong className="text-ink text-[11px] font-mono">
                      {activeTicket.user.name || "User"} &lt;{activeTicket.user.email}&gt;
                    </strong>
                  </div>

                  <div className="border-b border-[var(--line-subtle)] pb-2">
                    <span className="text-muted text-[10.5px] uppercase font-bold tracking-wider block mb-1">
                      Subjek:
                    </span>
                    <strong className="text-ink block text-xs leading-snug">
                      {activeTicket.subject}
                    </strong>
                  </div>

                  <div>
                    <span className="text-muted text-[10.5px] uppercase font-bold tracking-wider block mb-1">
                      Pesan:
                    </span>
                    <p className="text-ink-soft m-0 text-[11.5px] leading-relaxed whitespace-pre-wrap">
                      {activeTicket.message}
                    </p>
                  </div>
                </div>

                <form onSubmit={handleReplyTicket}>
                  <div className="form-group mb-2.5">
                    <label className="text-xs font-semibold mb-1 block text-ink">Ubah Status</label>
                    <select
                      suppressHydrationWarning
                      className="control w-full text-xs"
                      value={ticketStatus}
                      onChange={(e) => setTicketStatus(e.target.value)}
                    >
                      <option value="OPEN">OPEN (Belum Ditangani)</option>
                      <option value="IN_PROGRESS">IN_PROGRESS (Sedang Dikerjakan)</option>
                      <option value="RESOLVED">RESOLVED (Selesai & Terjawab)</option>
                      <option value="CLOSED">CLOSED (Ditutup)</option>
                    </select>
                  </div>

                  <div className="form-group mb-3">
                    <label className="text-xs font-semibold mb-1 block text-ink">Tulis Balasan Admin</label>
                    <textarea
                      className="control w-full text-xs"
                      style={{ minHeight: "105px", padding: "8px 10px", resize: "vertical" }}
                      placeholder="Tulis respon / solusi untuk developer ini..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="primary w-full btn-inline justify-center" disabled={submittingReply}>
                    <Send size={13} />
                    <span>{submittingReply ? "Menyimpan..." : "Kirim Respon"}</span>
                  </button>
                </form>
              </div>
            </article>
          ) : (
            <div className="panel p-6 text-center text-muted" style={{ width: "320px", flexShrink: 0 }}>
              <MessageSquare size={24} className="mx-auto text-muted mb-2 opacity-50" />
              <p className="text-xs m-0">Pilih tiket di sebelah kiri untuk melihat pesan lengkap dan mengirim balasan.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
