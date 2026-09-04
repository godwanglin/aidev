"use client";

import { useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  GitCommit,
  Sparkles,
  Zap,
  ShieldCheck,
  Cpu,
  Layers,
  Flame,
  CheckCircle2,
  Bug,
  Filter,
} from "lucide-react";

interface ChangelogItem {
  version: string;
  date: string;
  title: string;
  badge: "Release" | "Feature" | "Security" | "Optimization";
  badgeColor: string;
  summary: string;
  highlights: {
    category: "New" | "Improved" | "Fixed" | "Security";
    items: string[];
  }[];
}

const changelogs: ChangelogItem[] = [
  {
    version: "v1.4.0",
    date: "September 2026",
    title: "Aidev CLI Agent, DeepSeek Agent Suite & Overdraft Protection",
    badge: "Release",
    badgeColor: "bg-blue-soft text-blue border border-blue/20",
    summary:
      "Merilis ekosistem autonomous coding agent 'Aidev CLI', penambahan model agentik DeepSeek & Ollama Cloud Free Tier, serta sistem proteksi batas saldo token minus (-100k overdraft).",
    highlights: [
      {
        category: "New",
        items: [
          "Standalone autonomous coding agent Aidev CLI berbasis terminal (fork dari OpenCode).",
          "Dukungan model DeepSeek Agent-Ready (deepseek-chat V3, deepseek-v4-flash, deepseek-v4-flash-0731).",
          "Katalog Ollama Cloud Free Tier (gpt-oss:120b, gpt-oss-120b-medium, openrouter-free).",
          "Halaman dokumentasi interaktif (/docs) dengan syntax highlighter Prism Light Mode.",
        ],
      },
      {
        category: "Security",
        items: [
          "Sistem proteksi overdraft token balance dengan batas toleransi minus maksimal -100.000 tokens (HTTP 402 lock).",
          "Banner notifikasi kuota menipis otomatis di dashboard jika saldo user <= 500k tokens.",
        ],
      },
      {
        category: "Improved",
        items: [
          "Deduction token real-time berbasis post-response usage parsing yang akurat.",
          "Penghapusan kamus alias di gateway untuk direct 1:1 pass-through request.",
        ],
      },
    ],
  },
  {
    version: "v1.3.0",
    date: "September 2026",
    title: "Admin Models Management, Instant Copy & UI Polish",
    badge: "Feature",
    badgeColor: "bg-amber-soft text-amber border border-amber/20",
    summary:
      "Panel kontrol admin untuk manajemen katalog model (/admin/models), tombol copy 1-klik per model, serta pembersihan tombol navigasi redundan.",
    highlights: [
      {
        category: "New",
        items: [
          "Admin CRUD Management untuk model AI: Add, Edit, Deactivate, dan Delete model langsung dari web UI.",
          "Modal popup pembuatan/edit model dengan styling seragam dan responsive.",
          "Tombol inline copy model ID dengan visual feedback checklist 2 detik.",
        ],
      },
      {
        category: "Improved",
        items: [
          "Sidebar section khusus Admin Console dengan divider garis rapi dan role-based conditional rendering.",
          "Penyederhanaan tabel model dengan menghapus kolom cost lama agar murni berbasis saldo token.",
        ],
      },
      {
        category: "Fixed",
        items: [
          "Memperbaiki hydration mismatch pada browser extension via suppressHydrationWarning.",
          "Mengatasi undefined requestLogs count pada tabel API Keys.",
        ],
      },
    ],
  },
  {
    version: "v1.2.0",
    date: "September 2026",
    title: "Token Unit Billing, Flash Sale Promo & QRIS Payment Gateway",
    badge: "Feature",
    badgeColor: "bg-green-soft text-green border border-green/20",
    summary:
      "Perombakan total sistem billing menjadi unit token (bukan USD), integrasi payment gateway QRIS & Virtual Account, serta sistem diskon admin.",
    highlights: [
      {
        category: "New",
        items: [
          "Paket token baru: 1M (Rp 2.500), 5M (Rp 8.000), 10M (Rp 15.000), 25M (Rp 35.000), 50M (Rp 68.000), 100M (Rp 130.000).",
          "Simulasi pembayaran instan QRIS dan Bank Virtual Account (BCA/Mandiri).",
          "Strategi diskon terintegrasi: Promo Newcomer (20%), Admin Flash Sale (1x per user), dan High-Usage Loyalty (10% 3 hari).",
          "Panel admin pengaturan promo diskon di rute /admin.",
        ],
      },
      {
        category: "Security",
        items: [
          "Zero-XHR Anti-Bot Captcha dengan server-rendered distorted SVG pada halaman registrasi.",
          "Multi-tenant user data isolation di seluruh dashboard.",
        ],
      },
    ],
  },
  {
    version: "v1.1.0",
    date: "September 2026",
    title: "Database Indexing Optimization & High-Density Developer UI",
    badge: "Optimization",
    badgeColor: "bg-purple-soft text-purple border border-purple/20",
    summary:
      "Peningkatan kecepatan query jutaan baris database dengan composite indexing, micro-caching, dan Recharts sparkline visual.",
    highlights: [
      {
        category: "Improved",
        items: [
          "MySQL composite indexes pada tabel RequestLog, Order, dan TokenTopup.",
          "In-memory caching untuk endpoint dashboard metrics dan API key authentication.",
          "Integrasi Recharts grafik visual 'Requests by Model' dan MiniSparkline di metric cards.",
          "Server-side pagination di seluruh tabel data (Logs, Keys, Billing, Models).",
        ],
      },
    ],
  },
  {
    version: "v1.0.0",
    date: "September 2026",
    title: "Initial AI Gateway Release & OpenAI Compatibility",
    badge: "Release",
    badgeColor: "bg-blue-soft text-blue border border-blue/20",
    summary:
      "Rilis perdana platform AI Gateway SaaS dengan Next.js App Router, Prisma ORM, MySQL, dan 100% OpenAI SDK compatibility.",
    highlights: [
      {
        category: "New",
        items: [
          "Universal proxy router (/v1/[...path]) dengan SSE streaming support.",
          "Katalog model resmi: GPT-5.5, GPT-5.2, GPT-5.6 Luna, Claude Opus 4.6, Claude Fable 5, Claude Sonnet 5.",
          "Sistem manajemen API Keys (sk-int-...) dengan sliding-window rate limit (30 RPM).",
          "Dashboard monitoring traffic dan request logger otomatis.",
        ],
      },
    ],
  },
];

export default function ChangelogPage() {
  const [filter, setFilter] = useState<string>("all");

  const filteredLogs = changelogs.filter((c) => {
    if (filter === "all") return true;
    if (filter === "release") return c.badge === "Release";
    if (filter === "feature") return c.badge === "Feature";
    if (filter === "optimization") return c.badge === "Optimization";
    return true;
  });

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Product Changelog"
          subtitle="Riwayat rilis fitur baru, pembaruan performa, dan peningkatan keamanan platform AI Gateway."
        />

        {/* Filter Pills */}
        <div className="flex items-center gap-2 mb-4">
          <div className="segmented">
            <button
              className={`seg-btn ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All Updates
            </button>
            <button
              className={`seg-btn ${filter === "release" ? "active" : ""}`}
              onClick={() => setFilter("release")}
            >
              Releases
            </button>
            <button
              className={`seg-btn ${filter === "feature" ? "active" : ""}`}
              onClick={() => setFilter("feature")}
            >
              Features
            </button>
            <button
              className={`seg-btn ${filter === "optimization" ? "active" : ""}`}
              onClick={() => setFilter("optimization")}
            >
              Optimizations
            </button>
          </div>
          <span className="text-xs text-muted ml-auto">
            Showing {filteredLogs.length} updates
          </span>
        </div>

        {/* Timeline Container */}
        <div className="changelog-timeline">
          {filteredLogs.map((log) => (
            <article className="changelog-item" key={log.version}>
              <div className="changelog-dot" />

              <div className="changelog-card">
                <div className="changelog-header">
                  <div className="flex items-center gap-2">
                    <span className="mono font-semibold text-blue text-sm">
                      {log.version}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${log.badgeColor}`}>
                      {log.badge}
                    </span>
                    <span className="text-xs text-muted">&bull; {log.date}</span>
                  </div>
                  <h3 className="changelog-title">{log.title}</h3>
                  <p className="text-xs text-muted m-0">{log.summary}</p>
                </div>

                <div className="changelog-body">
                  {log.highlights.map((h, i) => (
                    <div key={i} className="mb-2.5 last:mb-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span
                          className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase ${
                            h.category === "New"
                              ? "bg-blue-soft text-blue"
                              : h.category === "Security"
                              ? "bg-amber-soft text-amber"
                              : h.category === "Improved"
                              ? "bg-purple-soft text-purple"
                              : "bg-green-soft text-green"
                          }`}
                        >
                          {h.category}
                        </span>
                      </div>
                      <ul className="changelog-list">
                        {h.items.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
