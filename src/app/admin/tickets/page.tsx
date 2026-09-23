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
  ChevronRight,
  ShieldCheck,
  Zap,
  Radio,
  XCircle,
  HelpCircle,
} from "lucide-react";
import CustomDropdown from "@/components/CustomDropdown";

interface TicketMessageItem {
  id: string;
  senderId: string;
  senderRole: "USER" | "ADMIN";
  senderName: string | null;
  message: string;
  createdAt: string;
}

interface TicketItem {
  id: string;
  category: string;
  subject: string;
  message: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  response: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
  messages?: TicketMessageItem[];
}

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testingPing, setTestingPing] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Selected Ticket for Conversation
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
        // If active ticket is open, refresh its messages
        if (activeTicket) {
          const fresh = json.data.find((t: TicketItem) => t.id === activeTicket.id);
          if (fresh) setActiveTicket(fresh);
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
    setErrorMsg("");
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
      } else {
        setErrorMsg(json.error || "Gagal menyimpan webhook.");
      }
    } catch {
      setErrorMsg("Network error.");
    }
    setSavingWebhook(false);
  }

  async function handleTestDiscordPing() {
    setTestingPing(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/tickets/test-discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: discordWebhookUrl }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(json.message || "Test ping sent to Discord channel successfully!");
        setTimeout(() => setSuccessMsg(""), 4000);
      } else {
        setErrorMsg(json.error || "Discord rejected ping.");
      }
    } catch {
      setErrorMsg("Failed to ping Discord webhook.");
    }
    setTestingPing(false);
  }

  async function handleSendReply(overrideStatus?: string) {
    if (!activeTicket) return;
    if (!replyText.trim() && !overrideStatus) return;

    setSubmittingReply(true);
    setErrorMsg("");
    const newStatus = overrideStatus || ticketStatus;

    try {
      const res = await fetch("/api/admin/tickets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: activeTicket.id,
          status: newStatus,
          message: replyText.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`Tiket #${activeTicket.id.slice(-6)} diperbarui ke ${newStatus}!`);
        setReplyText("");
        setTimeout(() => setSuccessMsg(""), 3000);
        if (json.data) {
          setActiveTicket(json.data);
        }
        fetchTickets();
      } else {
        setErrorMsg(json.error || "Gagal mengirim balasan.");
      }
    } catch {
      setErrorMsg("Network error.");
    }
    setSubmittingReply(false);
  }

  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    OPEN: { bg: "#fef3c7", text: "#92400e", label: "Open" },
    IN_PROGRESS: { bg: "#dbeafe", text: "#1e40af", label: "In Progress" },
    RESOLVED: { bg: "#dcfce7", text: "#166534", label: "Resolved" },
    CLOSED: { bg: "#f1f5f9", text: "#64748b", label: "Closed" },
  };

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Admin Support & Tickets Center"
          subtitle="Kelola tiket developer, diskusikan keluhan dalam chat thread multi-pesan, dan atur webhook Discord notifikasi."
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

        {errorMsg && (
          <div className="login-error mb-3 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Discord Webhook Configuration Panel */}
        <article className="panel mb-4">
          <div className="panel-title">
            <h2>
              <Radio size={14} className="text-blue shrink-0" />
              <span>Discord Notification Webhook</span>
            </h2>
          </div>
          <form onSubmit={handleSaveWebhook} className="p-3">
            <p className="text-xs text-muted mb-2">
              Setiap tiket baru atau pesan lanjutan dari developer akan dikirimkan otomatis ke channel Discord admin.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="url"
                className="control flex-1"
                style={{ minWidth: "280px" }}
                value={discordWebhookUrl}
                onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
              />
              <button type="submit" className="primary btn-inline" disabled={savingWebhook}>
                <Save size={12} />
                <span>{savingWebhook ? "Menyimpan..." : "Simpan Webhook"}</span>
              </button>
              <button
                type="button"
                className="control btn-inline"
                disabled={testingPing || !discordWebhookUrl}
                onClick={handleTestDiscordPing}
                title="Kirim pesan test ping ke Discord"
              >
                <Zap size={12} className="text-amber-500" />
                <span>{testingPing ? "Menguji..." : "Test Ping"}</span>
              </button>
            </div>
          </form>
        </article>

        {/* Status Filter Tabs */}
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="segmented">
            {[
              { id: "all", label: "All Tickets" },
              { id: "OPEN", label: "Open" },
              { id: "IN_PROGRESS", label: "In Progress" },
              { id: "RESOLVED", label: "Resolved" },
              { id: "CLOSED", label: "Closed" },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`seg-btn text-xs ${statusFilter === tab.id ? "active" : ""}`}
                onClick={() => setStatusFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-muted">
            Menampilkan {tickets.length} tiket
          </span>
        </div>

        {/* Split View: Tickets List on Left, Active Conversation on Right */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Left Column: Tickets List */}
          <div className="md:col-span-5 flex flex-col gap-2">
            {loading ? (
              <div className="panel p-6 text-center text-muted text-xs">Memuat tiket...</div>
            ) : tickets.length === 0 ? (
              <div className="panel p-6 text-center text-muted text-xs">
                Tidak ada tiket pada kategori ini.
              </div>
            ) : (
              tickets.map((t) => {
                const isSelected = activeTicket?.id === t.id;
                const statusInfo = statusColors[t.status] || statusColors.OPEN;
                const messageCount = (t.messages && t.messages.length > 0) ? t.messages.length : 1;

                return (
                  <article
                    key={t.id}
                    className={`panel p-3 cursor-pointer transition-all ${
                      isSelected ? "border-blue ring-1 ring-blue" : "hover:border-slate-400"
                    }`}
                    onClick={() => {
                      setActiveTicket(t);
                      setTicketStatus(t.status);
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="text-[11px] font-bold px-2 py-0.5 rounded"
                        style={{ backgroundColor: statusInfo.bg, color: statusInfo.text }}
                      >
                        {statusInfo.label}
                      </span>
                      <span className="mono text-[10px] text-muted">
                        #{t.id.slice(-6)}
                      </span>
                    </div>

                    <h3 className="font-semibold text-xs text-ink mb-1 line-clamp-1">
                      {t.subject}
                    </h3>

                    <p className="text-muted text-[11px] line-clamp-2 mb-2">
                      {t.message}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-muted pt-1 border-t border-slate-100">
                      <span>{t.user?.name || t.user?.email}</span>
                      <span className="flex items-center gap-1">
                        <MessageSquare size={10} />
                        <span>{messageCount} pesan</span>
                      </span>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* Right Column: Conversation Thread Viewer & Reply Box */}
          <div className="md:col-span-7">
            {activeTicket ? (
              <article className="panel flex flex-col" style={{ minHeight: "520px" }}>
                {/* Header */}
                <div className="p-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs font-bold text-blue">
                        #{activeTicket.id.slice(-6)}
                      </span>
                      <span className="font-semibold text-xs text-ink">
                        {activeTicket.subject}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted">
                      Pengirim: <strong>{activeTicket.user?.name || "Developer"}</strong> ({activeTicket.user?.email}) • Kategori: {activeTicket.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <CustomDropdown
                      size="sm"
                      value={ticketStatus}
                      onChange={(val) => {
                        setTicketStatus(val);
                        handleSendReply(val);
                      }}
                      options={[
                        {
                          value: "OPEN",
                          label: "Open",
                          icon: <Clock size={13} className="text-amber-500" />,
                        },
                        {
                          value: "IN_PROGRESS",
                          label: "In Progress",
                          icon: <RefreshCw size={13} className="text-blue" />,
                        },
                        {
                          value: "RESOLVED",
                          label: "Resolved",
                          icon: <CheckCircle2 size={13} className="text-emerald-500" />,
                        },
                        {
                          value: "CLOSED",
                          label: "Closed",
                          icon: <XCircle size={13} className="text-slate-400" />,
                        },
                      ]}
                      minWidth={130}
                      align="right"
                    />
                  </div>
                </div>

                {/* Conversation Message List */}
                <div className="p-4 flex-1 overflow-y-auto space-y-3 bg-[#fcfcfd]" style={{ maxHeight: "360px" }}>
                  {/* First Ticket Description / Initial message */}
                  <div className="flex flex-col items-start max-w-[85%]">
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] text-muted">
                      <User size={10} />
                      <span className="font-semibold">{activeTicket.user?.name || "Developer"}</span>
                      <span>• {new Date(activeTicket.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <div className="p-2.5 rounded bg-white border border-slate-200 text-xs text-ink shadow-sm">
                      {activeTicket.message}
                    </div>
                  </div>

                  {/* Message Thread */}
                  {activeTicket.messages &&
                    activeTicket.messages.map((msg, idx) => {
                      // Skip if message matches the initial ticket message
                      if (idx === 0 && msg.message === activeTicket.message) return null;

                      const isAdmin = msg.senderRole === "ADMIN";
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col max-w-[85%] ${
                            isAdmin ? "items-end ml-auto" : "items-start"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 text-[10px] text-muted">
                            {isAdmin ? <ShieldCheck size={10} className="text-blue" /> : <User size={10} />}
                            <span className="font-semibold">{isAdmin ? "Admin Operator" : msg.senderName || "Developer"}</span>
                            <span>• {new Date(msg.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <div
                            className={`p-2.5 rounded text-xs shadow-sm ${
                              isAdmin
                                ? "bg-[#2563eb] text-white"
                                : "bg-white border border-slate-200 text-ink"
                            }`}
                          >
                            {msg.message}
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Reply Form */}
                <div className="p-3 border-t border-slate-200 bg-white">
                  {/* Canned Responses */}
                  <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1">
                    <span className="text-[10px] text-muted shrink-0">Template:</span>
                    {[
                      "Kami sedang menginvestigasi kendala ini.",
                      "Masalah telah diperbaiki, silakan uji kembali.",
                      "Mohon lampirkan potongan request payload Anda.",
                    ].map((canned, i) => (
                      <button
                        key={i}
                        type="button"
                        className="control text-[10px] py-0.5 px-1.5 shrink-0 hover:text-blue"
                        onClick={() => setReplyText((prev) => (prev ? prev + " " + canned : canned))}
                      >
                        {canned}
                      </button>
                    ))}
                  </div>

                  <textarea
                    className="control w-full text-xs p-2"
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Ketik balasan admin ke developer..."
                  />

                  <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="control text-xs py-1 px-2 hover:text-green"
                        onClick={() => handleSendReply("RESOLVED")}
                        disabled={submittingReply}
                        title="Balas dan ubah status ke Resolved"
                      >
                        <Check size={11} className="text-green" />
                        <span>Kirim & Selesai</span>
                      </button>
                      <button
                        type="button"
                        className="control text-xs py-1 px-2 hover:text-slate-500"
                        onClick={() => handleSendReply("CLOSED")}
                        disabled={submittingReply}
                        title="Tutup tiket ini"
                      >
                        <XCircle size={11} />
                        <span>Tutup Tiket</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      className="primary btn-inline text-xs"
                      disabled={submittingReply || !replyText.trim()}
                      onClick={() => handleSendReply()}
                    >
                      <Send size={11} />
                      <span>{submittingReply ? "Mengirim..." : "Kirim Balasan"}</span>
                    </button>
                  </div>
                </div>
              </article>
            ) : (
              <article className="panel p-12 text-center text-muted">
                <LifeBuoy size={32} className="mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-xs text-ink mb-1">Pilih Tiket untuk Melihat Percakapan</p>
                <span className="text-xs">Klik salah satu tiket di sebelah kiri untuk melihat riwayat pesan dan memberikan balasan.</span>
              </article>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
