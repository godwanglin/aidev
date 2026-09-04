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
} from "lucide-react";

interface TicketItem {
  id: string;
  category: string;
  subject: string;
  message: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  response: string | null;
  createdAt: string;
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

  // Form State
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("Technical");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function fetchUserTickets() {
    setLoadingTickets(true);
    try {
      const res = await fetch("/api/support");
      const json = await res.json();
      if (json.data) setTickets(json.data);
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
        setTimeout(() => setSubmitted(false), 5000);
      }
    } catch {}
    setSubmitting(false);
  }

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Support & Help Center"
          subtitle="Hubungi tim teknis kami atau temukan jawaban cepat melalui Frequently Asked Questions (FAQ)."
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

        {/* Main Grid: Ticket Form (Left) & FAQ + History (Right) */}
        <div className="bottom">
          {/* Support Ticket Form */}
          <article className="panel">
            <div className="panel-title">
              <h2>
                <MessageSquare size={14} className="text-blue" />
                <span>Kirim Tiket Bantuan Teknis</span>
              </h2>
            </div>
            <div className="settings-body">
              {submitted && (
                <div className="banner-alert mb-3">
                  <CheckCircle2 size={16} className="text-green" />
                  <div className="banner-text">
                    <strong>Tiket Berhasil Dikirim ke Tim & Discord!</strong>
                    <p>Pesan Anda telah dicatat di database support dan dinotifikasikan ke teknisi kami.</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitTicket}>
                <div className="form-group mb-3">
                  <label className="text-xs font-semibold mb-1 block text-ink">Kategori Masalah</label>
                  <select
                    suppressHydrationWarning
                    className="control w-full"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="Technical">Integrasi API & Gateway</option>
                    <option value="Billing">Billing & Top Up Saldo</option>
                    <option value="AidevCLI">Aidev CLI & Coding Agent</option>
                    <option value="Account">Akun & Keamanan</option>
                    <option value="Feature">Request Model / Fitur Baru</option>
                  </select>
                </div>

                <div className="form-group mb-3">
                  <label className="text-xs font-semibold mb-1 block text-ink">Subjek Tiket</label>
                  <input
                    suppressHydrationWarning
                    type="text"
                    className="control w-full"
                    placeholder="Contoh: Kendala rate limit model gpt-5.2"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group mb-3">
                  <label className="text-xs font-semibold mb-1 block text-ink">Detail Pertanyaan / Kendala</label>
                  <textarea
                    className="control w-full"
                    style={{ minHeight: "110px", padding: "8px 10px", resize: "vertical" }}
                    placeholder="Jelaskan detail pertanyaan, langkah reproduksi, atau pesan error yang Anda temukan..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button type="submit" className="primary btn-inline" disabled={submitting}>
                    <Send size={13} />
                    <span>{submitting ? "Mengirim ke Sistem..." : "Kirim Tiket Bantuan"}</span>
                  </button>
                </div>
              </form>
            </div>
          </article>

          {/* Right Column: Riwayat Tiket Saya & FAQ */}
          <div className="flex flex-col gap-3">
            {/* User's Ticket History */}
            <article className="panel">
              <div className="panel-title">
                <h2>
                  <Inbox size={14} className="text-blue" />
                  <span>Riwayat Tiket Saya</span>
                </h2>
              </div>
              <div className="p-3">
                {loadingTickets ? (
                  <p className="text-xs text-muted text-center py-2">Memuat riwayat tiket...</p>
                ) : tickets.length === 0 ? (
                  <p className="text-xs text-muted text-center py-2">Belum ada tiket bantuan yang dikirim.</p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto">
                    {tickets.map((t) => (
                      <div key={t.id} className="p-2.5 bg-[#f8fafc] border border-[var(--line)] rounded text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <strong className="text-ink">{t.subject}</strong>
                          <span
                            className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                              t.status === "OPEN"
                                ? "bg-amber-soft text-amber border border-amber/20"
                                : t.status === "RESOLVED"
                                ? "bg-green-soft text-green border border-green/20"
                                : "bg-blue-soft text-blue border border-blue/20"
                            }`}
                          >
                            {t.status}
                          </span>
                        </div>
                        <p className="text-muted m-0 text-[11px] line-clamp-1">{t.message}</p>
                        {t.response && (
                          <div className="mt-1.5 p-1.5 bg-white border-l-2 border-blue rounded text-[11px] text-ink">
                            <strong>Respon Admin:</strong> {t.response}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
                        className="faq-question"
                        onClick={() => setOpenFaq(isOpen ? null : idx)}
                      >
                        <span>{item.q}</span>
                        {isOpen ? (
                          <ChevronUp size={14} className="text-blue shrink-0 ml-2" />
                        ) : (
                          <ChevronDown size={14} className="text-muted shrink-0 ml-2" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="faq-answer">
                          {item.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
