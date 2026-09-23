"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  LifeBuoy,
  MessageSquare,
  Mail,
  Send,
  CheckCircle2,
  HelpCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Inbox,
  AlertCircle,
  User,
  ShieldCheck,
  Check,
  XCircle,
  Plus,
  RefreshCw,
  CreditCard,
  Terminal,
  Sparkles,
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
  messages?: TicketMessageItem[];
}

const FAQ_ITEMS = [
  {
    q: "Bagaimana cara menghubungkan AI Gateway ke proyek saya?",
    a: "Anda cukup mengganti baseURL pada library OpenAI SDK menjadi http://localhost:3000/v1 dan memasukkan API Key internal (sk-int-...) yang telah dibuat di menu API Keys.",
  },
  {
    q: "Berapa batas toleransi minus saldo token balance?",
    a: "Sistem memberikan batas toleransi minus overdraft hingga -100.000 tokens agar request AI Anda tidak terputus tiba-tiba di tengah eksekusi coding / agent penting.",
  },
  {
    q: "Metode pembayaran apa saja yang didukung untuk top up?",
    a: "Kami mendukung QRIS instan (BCA, GoPay, OVO, DANA, ShopeePay, LinkAja) serta Virtual Account Bank (BCA & Mandiri) dengan auto-credit saldo real-time.",
  },
  {
    q: "Apakah gateway ini mendukung tool-calling dan streaming SSE?",
    a: "Ya, 100% mendukung streaming Server-Sent Events (SSE) dan function / tool-calling untuk framework AI Agents seperti LangChain, Cursor, Cline, dan Aidev CLI.",
  },
  {
    q: "Bagaimana cara menjalankan autonomous coding agent Aidev CLI?",
    a: "Cukup buka terminal di direktori proyek Anda dan ketik perintah `aidev`. Agent akan otomatis terhubung ke gateway dan siap membantu coding secara autonomous.",
  },
];

export default function SupportPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);

  // Form State
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("Technical");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Follow-up reply state
  const [replyMessage, setReplyMessage] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [replySuccess, setReplySuccess] = useState("");

  async function fetchUserTickets() {
    setLoadingTickets(true);
    try {
      const res = await fetch("/api/support");
      const json = await res.json();
      if (json.data) {
        setTickets(json.data);
        if (selectedTicket) {
          const fresh = json.data.find((t: TicketItem) => t.id === selectedTicket.id);
          if (fresh) setSelectedTicket(fresh);
        }
      }
    } catch {}
    setLoadingTickets(false);
  }

  useEffect(() => {
    fetchUserTickets();
  }, []);

  async function handleSubmitTicket(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subject, message }),
      });
      const json = await res.json();
      if (json.success) {
        setSubmitted(true);
        setSubject("");
        setMessage("");
        fetchUserTickets();
        if (json.data) setSelectedTicket(json.data);
        setTimeout(() => setSubmitted(false), 5000);
      }
    } catch {}
    setSubmitting(false);
  }

  async function handleSendReply(overrideStatus?: string) {
    if (!selectedTicket) return;
    if (!replyMessage.trim() && !overrideStatus) return;

    setSubmittingReply(true);
    setReplySuccess("");
    try {
      const res = await fetch("/api/support", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          message: replyMessage.trim() || undefined,
          status: overrideStatus,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setReplySuccess("Pesan terkirim ke tim teknis!");
        setReplyMessage("");
        if (json.data) setSelectedTicket(json.data);
        fetchUserTickets();
        setTimeout(() => setReplySuccess(""), 3000);
      }
    } catch {}
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
          title="Support & Help Center"
          subtitle="Hubungi tim teknis kami, diskusikan tiket dalam percakapan interaktif, atau temukan jawaban cepat pada FAQ."
        />

        {/* 3 Horizontal Metric Grid Cards */}
        <div className="docs-cards-grid">
          <div className="doc-feature-card">
            <div className="flex items-center gap-2">
              <Mail size={15} className="text-blue shrink-0" />
              <strong className="text-xs font-semibold">Email Engineering</strong>
            </div>
            <p className="text-xs text-muted m-0">
              Pertanyaan teknis & enterprise SLA: <br />
              <a href="mailto:support@aidev.local" className="text-blue font-semibold hover:underline">
                support@aidev.local
              </a>
            </p>
          </div>

          <div className="doc-feature-card">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-green shrink-0" />
              <strong className="text-xs font-semibold">Response SLA</strong>
            </div>
            <p className="text-xs text-muted m-0">
              Rata-rata waktu respon teknis: <br />
              <strong className="text-ink text-xs">&lt; 15 Menit</strong> (Jam Kerja) / 24/7 Monitoring
            </p>
          </div>

          <div className="doc-feature-card">
            <div className="flex items-center gap-2">
              <LifeBuoy size={15} className="text-amber-500 shrink-0" />
              <strong className="text-xs font-semibold">System Status</strong>
            </div>
            <p className="text-xs text-muted m-0">
              Semua endpoint & database operasional: <br />
              <span className="status-dot online">100% Operational (99.99% Uptime)</span>
            </p>
          </div>
        </div>

        {/* Main Section */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-4">
          {/* Left Column: Form & FAQ */}
          <div className="md:col-span-6 flex flex-col gap-4">
            {/* Support Ticket Form */}
            <article className="panel">
              <div className="panel-title">
                <h2>
                  <Plus size={14} className="text-blue" />
                  <span>Buat Tiket Bantuan Baru</span>
                </h2>
              </div>
              <div className="settings-body">
                {submitted && (
                  <div className="banner-alert mb-3">
                    <CheckCircle2 size={16} className="text-green" />
                    <div className="banner-text">
                      <strong>Tiket Berhasil Dibuat!</strong>
                      <p>Pesan Anda telah dikirim ke teknisi kami dan dinotifikasikan via Discord.</p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmitTicket}>
                  <div className="form-group mb-3">
                    <label className="text-xs font-semibold mb-1 block text-ink">Kategori Masalah</label>
                    <CustomDropdown
                      size="md"
                      width="100%"
                      value={category}
                      onChange={(val) => setCategory(val)}
                      options={[
                        {
                          value: "Technical",
                          label: "Integrasi API & Gateway",
                          icon: <ShieldCheck size={14} className="text-blue" />,
                        },
                        {
                          value: "Billing",
                          label: "Billing & Top Up Saldo",
                          icon: <CreditCard size={14} className="text-emerald-500" />,
                        },
                        {
                          value: "AidevCLI",
                          label: "Aidev CLI & Coding Agent",
                          icon: <Terminal size={14} className="text-purple-500" />,
                        },
                        {
                          value: "Account",
                          label: "Akun & Keamanan",
                          icon: <User size={14} className="text-amber-500" />,
                        },
                        {
                          value: "Feature",
                          label: "Request Model / Fitur Baru",
                          icon: <Sparkles size={14} className="text-pink-500" />,
                        },
                      ]}
                    />
                  </div>

                  <div className="form-group mb-3">
                    <label className="text-xs font-semibold mb-1 block text-ink">Subjek Kendala</label>
                    <input
                      suppressHydrationWarning
                      type="text"
                      className="control w-full text-xs"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Contoh: Error 429 saat memanggil endpoint completions"
                      required
                    />
                  </div>

                  <div className="form-group mb-3">
                    <label className="text-xs font-semibold mb-1 block text-ink">Rincian Pesan & Log</label>
                    <textarea
                      suppressHydrationWarning
                      className="control w-full text-xs"
                      rows={3}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Jelaskan detail kendala teknis atau lampirkan error message..."
                      required
                    />
                  </div>

                  <div className="flex justify-end">
                    <button type="submit" className="primary btn-inline text-xs" disabled={submitting}>
                      <Send size={12} />
                      <span>{submitting ? "Mengirim..." : "Kirim Tiket"}</span>
                    </button>
                  </div>
                </form>
              </div>
            </article>

            {/* FAQ Accordion */}
            <article className="panel">
              <div className="panel-title">
                <h2>
                  <HelpCircle size={14} className="text-purple-600" />
                  <span>Frequently Asked Questions (FAQ)</span>
                </h2>
              </div>
              <div className="faq-container">
                {FAQ_ITEMS.map((item, idx) => {
                  const isOpen = openFaq === idx;
                  return (
                    <div key={idx} className={`faq-item ${isOpen ? "open" : ""}`}>
                      <button
                        type="button"
                        className="faq-question text-xs font-semibold"
                        onClick={() => setOpenFaq(isOpen ? null : idx)}
                      >
                        <span>{item.q}</span>
                        {isOpen ? (
                          <ChevronUp size={14} className="text-blue shrink-0 ml-2" />
                        ) : (
                          <ChevronDown size={14} className="text-muted shrink-0 ml-2" />
                        )}
                      </button>
                      {isOpen && <div className="faq-answer text-xs text-muted">{item.a}</div>}
                    </div>
                  );
                })}
              </div>
            </article>
          </div>

          {/* Right Column: Ticket History & Conversation Thread */}
          <div className="md:col-span-6 flex flex-col gap-4">
            {/* Conversation Thread (if a ticket is selected) */}
            {selectedTicket ? (
              <article className="panel flex flex-col" style={{ minHeight: "480px" }}>
                <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs font-bold text-blue">
                        #{selectedTicket.id.slice(-6)}
                      </span>
                      <span className="font-semibold text-xs text-ink">
                        {selectedTicket.subject}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted">
                      Kategori: {selectedTicket.category} • Status:{" "}
                      <span
                        className="font-bold px-1.5 py-0.2 rounded text-[10px]"
                        style={{
                          backgroundColor: statusColors[selectedTicket.status]?.bg || "#f1f5f9",
                          color: statusColors[selectedTicket.status]?.text || "#64748b",
                        }}
                      >
                        {statusColors[selectedTicket.status]?.label || selectedTicket.status}
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {selectedTicket.status !== "CLOSED" ? (
                      <button
                        className="control text-xs py-1 px-2"
                        onClick={() => handleSendReply("CLOSED")}
                        title="Tandai tiket ini selesai / tutup tiket"
                      >
                        <Check size={11} className="text-green" />
                        <span>Tutup Tiket</span>
                      </button>
                    ) : (
                      <button
                        className="control text-xs py-1 px-2"
                        onClick={() => handleSendReply("OPEN")}
                        title="Buka kembali tiket ini"
                      >
                        <RefreshCw size={11} />
                        <span>Buka Kembali</span>
                      </button>
                    )}
                    <button
                      className="control btn-icon-only text-xs"
                      onClick={() => setSelectedTicket(null)}
                      title="Kembali ke daftar tiket"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Messages List */}
                <div className="p-3 flex-1 overflow-y-auto space-y-3 bg-[#fcfcfd]" style={{ maxHeight: "300px" }}>
                  {/* First message */}
                  <div className="flex flex-col items-start max-w-[85%]">
                    <div className="flex items-center gap-1 mb-1 text-[10px] text-muted">
                      <User size={10} />
                      <span className="font-semibold">Anda</span>
                      <span>• {new Date(selectedTicket.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <div className="p-2.5 rounded bg-white border border-slate-200 text-xs text-ink shadow-sm">
                      {selectedTicket.message}
                    </div>
                  </div>

                  {/* Thread messages */}
                  {selectedTicket.messages &&
                    selectedTicket.messages.map((msg, idx) => {
                      if (idx === 0 && msg.message === selectedTicket.message) return null;
                      const isMe = msg.senderRole === "USER";
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col max-w-[85%] ${
                            isMe ? "items-start" : "items-end ml-auto"
                          }`}
                        >
                          <div className="flex items-center gap-1 mb-1 text-[10px] text-muted">
                            {!isMe ? <ShieldCheck size={10} className="text-blue" /> : <User size={10} />}
                            <span className="font-semibold">{isMe ? "Anda" : "Tim Support Aidev"}</span>
                            <span>• {new Date(msg.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <div
                            className={`p-2.5 rounded text-xs shadow-sm ${
                              !isMe
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

                {/* Reply Box */}
                <div className="p-3 border-t border-slate-200 bg-white">
                  {replySuccess && (
                    <div className="text-xs text-green mb-1.5 flex items-center gap-1 font-semibold">
                      <CheckCircle2 size={12} />
                      <span>{replySuccess}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <textarea
                      className="control flex-1 text-xs p-2"
                      rows={2}
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder={
                        selectedTicket.status === "CLOSED"
                          ? "Tiket telah ditutup. Ketik pesan untuk membuka kembali..."
                          : "Tulis balasan pesan lanjutan Anda..."
                      }
                    />
                    <button
                      type="button"
                      className="primary btn-inline text-xs shrink-0 self-end"
                      disabled={submittingReply || !replyMessage.trim()}
                      onClick={() => handleSendReply()}
                    >
                      <Send size={11} />
                      <span>Kirim</span>
                    </button>
                  </div>
                </div>
              </article>
            ) : null}

            {/* Ticket History List */}
            <article className="panel">
              <div className="panel-title">
                <h2>
                  <Inbox size={14} className="text-green" />
                  <span>Riwayat Tiket Saya ({tickets.length})</span>
                </h2>
                <button className="control btn-icon-only" onClick={fetchUserTickets} title="Muat ulang tiket">
                  <RefreshCw size={12} />
                </button>
              </div>
              <div className="p-3">
                {loadingTickets ? (
                  <p className="text-muted text-xs text-center py-4">Memuat riwayat tiket...</p>
                ) : tickets.length === 0 ? (
                  <p className="text-muted text-xs text-center py-4">Belum ada tiket bantuan yang dibuat.</p>
                ) : (
                  <div className="space-y-2">
                    {tickets.map((t) => {
                      const isSelected = selectedTicket?.id === t.id;
                      const statusInfo = statusColors[t.status] || statusColors.OPEN;
                      const messageCount = (t.messages && t.messages.length > 0) ? t.messages.length : 1;

                      return (
                        <div
                          key={t.id}
                          className={`p-2.5 rounded border cursor-pointer transition-all ${
                            isSelected ? "border-blue bg-blue-50/20" : "border-slate-200 hover:border-slate-300"
                          }`}
                          onClick={() => setSelectedTicket(t)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-xs text-ink line-clamp-1">{t.subject}</span>
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ml-2"
                              style={{ backgroundColor: statusInfo.bg, color: statusInfo.text }}
                            >
                              {statusInfo.label}
                            </span>
                          </div>

                          <p className="text-muted text-[11px] line-clamp-1 mb-1.5">{t.message}</p>

                          <div className="flex items-center justify-between text-[10px] text-muted">
                            <span className="mono">#{t.id.slice(-6)} • {new Date(t.createdAt).toLocaleDateString()}</span>
                            <span className="text-blue font-medium flex items-center gap-1">
                              <MessageSquare size={10} />
                              <span>{messageCount} pesan (Buka Obrolan)</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </article>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
