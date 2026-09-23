"use client";

import { useState, useEffect } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import {
  Code2,
  Terminal,
  Cpu,
  ShieldCheck,
  Zap,
  Copy,
  Check,
  Layers,
  Sparkles,
  Bot,
  Laptop,
  Server,
  FileJson,
  Key,
  CheckCircle2,
  Flame,
  Globe,
  Settings,
} from "lucide-react";

type DocTab = "opencode" | "codex" | "other-agents" | "sdks" | "api";

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<DocTab>("opencode");
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  useEffect(() => {
    Prism.highlightAll();
  }, [activeTab]);

  function handleCopy(code: string, id: string) {
    navigator.clipboard.writeText(code);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  }

  // Snippets
  const openCodeJsonSnippet = `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "aidev_gateway": {
      "name": "Aidev AI Gateway",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:3000/v1",
        "apiKey": "sk-int-your-internal-api-key"
      },
      "models": {
        "deepseek-reasoner": {
          "name": "DeepSeek Reasoner R1",
          "reasoning": true,
          "tool_call": true,
          "limit": {
            "context": 64000,
            "output": 8192
          }
        },
        "deepseek-chat": {
          "name": "DeepSeek V3 Chat",
          "tool_call": true,
          "limit": {
            "context": 64000,
            "output": 8192
          }
        },
        "gpt-5.2": {
          "name": "GPT-5.2 Ultra Coding",
          "tool_call": true,
          "limit": {
            "context": 128000,
            "output": 8192
          }
        },
        "claude-3-7-sonnet": {
          "name": "Claude 3.7 Sonnet",
          "reasoning": true,
          "tool_call": true,
          "limit": {
            "context": 200000,
            "output": 8192
          }
        },
        "gemini-2.5-pro": {
          "name": "Gemini 2.5 Pro",
          "tool_call": true,
          "limit": {
            "context": 1000000,
            "output": 8192
          }
        }
      }
    }
  }
}`;

  const openCodeBashSnippet = `# 1. Export Environment Variables (Linux / macOS)
export OPENAI_BASE_URL="http://localhost:3000/v1"
export OPENAI_API_KEY="sk-int-your-internal-api-key"

# 2. Jalankan OpenCode langsung dengan model yang diinginkan
opencode run "Buatkan CRUD REST API di Go dengan Gin dan PostgreSQL"

# Atau buka mode interaktif TUI
opencode --model aidev_gateway/deepseek-reasoner`;

  const openCodePowershellSnippet = `# 1. Set Environment Variables (Windows PowerShell)
$env:OPENAI_BASE_URL = "http://localhost:3000/v1"
$env:OPENAI_API_KEY = "sk-int-your-internal-api-key"

# 2. Jalankan OpenCode CLI
opencode run "Refactor database migration dan buat unit tests"

# Atau gunakan Aidev CLI bawaan
aidev run "Optimalkan performa query dan perbaiki authentication middleware"`;

  const codexConfigSnippet = `{
  "apiEndpoint": "http://localhost:3000/v1/responses",
  "apiKey": "sk-int-your-internal-api-key",
  "model": "deepseek-reasoner",
  "features": {
    "accordionThinking": true,
    "retainReasoningHistory": true,
    "streaming": true
  }
}`;

  const claudeCodeSnippet = `# Konfigurasi Claude Code CLI agar mengarah ke AI Gateway kita
export ANTHROPIC_BASE_URL="http://localhost:3000/v1"
export ANTHROPIC_API_KEY="sk-int-your-internal-api-key"

# Jalankan Claude Code di workspace direktori Anda
claude "Review arsitektur repository dan carikan potensi memory leak"`;

  const cursorSnippet = `// Pengaturan Cursor IDE:
// 1. Tekan Ctrl + Shift + J (atau Cmd + Shift + J) -> Buka Cursor Settings
// 2. Pilih menu "Models" di bilah kiri
// 3. Pada seksi "OpenAI API Key":
//    - Aktifkan toggle "Override OpenAI Base URL"
//    - Isi Base URL: http://localhost:3000/v1
//    - Masukkan API Key: sk-int-your-internal-api-key
// 4. Tambahkan nama model kustom di daftar model:
//    - deepseek-reasoner
//    - deepseek-chat
//    - gpt-5.2
//    - claude-3-7-sonnet
// 5. Simpan dan klik tombol Verify.`;

  const clineSnippet = `{
  "cline.apiProvider": "openai-compatible",
  "cline.openAiBaseUrl": "http://localhost:3000/v1",
  "cline.openAiApiKey": "sk-int-your-internal-api-key",
  "cline.openAiModelId": "deepseek-reasoner",
  "cline.maxTokens": 8192
}`;

  const pythonSnippet = `from openai import OpenAI

# Inisialisasi client OpenAI resmi mengarah ke AI Gateway
client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="sk-int-your-internal-api-key"
)

# 1. Chat Completion Standar
response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=[
        {"role": "system", "content": "You are an elite coding assistant."},
        {"role": "user", "content": "Tuliskan algoritma Dijkstra dengan heap di Python."}
    ],
    temperature=0.6,
    max_tokens=2048
)

print(response.choices[0].message.content)

# 2. Real-Time Streaming SSE (dengan reasoning text)
stream = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=[{"role": "user", "content": "Jelaskan perbedaan TCP vs UDP"}],
    stream=True
)

for chunk in stream:
    # Delta content biasa
    content = chunk.choices[0].delta.content or ""
    # Reasoning content (jika model pemikir seperti DeepSeek R1)
    reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None) or ""
    if reasoning:
        print(f"[Thinking] {reasoning}", end="", flush=True)
    if content:
        print(content, end="", flush=True)`;

  const nodeSnippet = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:3000/v1",
  apiKey: "sk-int-your-internal-api-key",
});

async function run() {
  // Real-time Server-Sent Events (SSE) streaming
  const stream = await client.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: "You are an expert DevOps engineer." },
      { role: "user", content: "Jelaskan zero-downtime rolling deployment di Kubernetes." }
    ],
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(delta);
  }
  console.log("\\nSelesai.");
}

run();`;

  const curlChatSnippet = `curl -X POST http://localhost:3000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-int-your-internal-api-key" \\
  -d '{
    "model": "deepseek-reasoner",
    "messages": [
      {"role": "user", "content": "Halo AI Gateway! Buatkan fungsi debounce di JavaScript."}
    ],
    "stream": true,
    "max_tokens": 1000
  }'`;

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Developer Documentation"
          subtitle="Panduan komprehensif integrasi AI Gateway untuk OpenCode CLI, Codex Desktop, Cursor, Claude Code, dan SDK resmi."
        />

        {/* Quick Connection Banner */}
        <div className="docs-banner">
          <div className="docs-banner-left">
            <div className="docs-banner-icon">
              <Globe size={22} strokeWidth={1.75} />
            </div>
            <div className="docs-banner-info">
              <div className="docs-banner-title-row">
                <span>AI Gateway Endpoint URL</span>
                <span className="docs-status-pill">
                  <span className="docs-pulse-dot" />
                  Online
                </span>
              </div>
              <div className="docs-url-box">
                <code className="docs-url-code">http://localhost:3000/v1</code>
                <button
                  onClick={() => handleCopy("http://localhost:3000/v1", "base_url")}
                  className="docs-url-copy-btn"
                >
                  {copiedSection === "base_url" ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                  <span>{copiedSection === "base_url" ? "Disalin!" : "Salin URL"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Badges Grid */}
          <div className="docs-badges-grid">
            <div className="docs-badge-box">
              <div className="docs-badge-label">Kesesuaian</div>
              <div className="docs-badge-val">100% OpenAI</div>
            </div>
            <div className="docs-badge-box">
              <div className="docs-badge-label">Protokol</div>
              <div className="docs-badge-val">SSE + Responses</div>
            </div>
            <div className="docs-badge-box">
              <div className="docs-badge-label">Reasoning</div>
              <div className="docs-badge-val green">Thought Accordion</div>
            </div>
            <div className="docs-badge-box">
              <div className="docs-badge-label">Routing</div>
              <div className="docs-badge-val blue">Smart Failover</div>
            </div>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="docs-cards-grid">
          <div className="doc-feature-card">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Cpu size={16} color="#2563eb" style={{ flexShrink: 0 }} />
              <strong style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)" }}>100% OpenAI Drop-In</strong>
            </div>
            <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0, lineHeight: 1.55 }}>
              Langsung kompatibel dengan OpenCode CLI, Aidev CLI, Codex Desktop, Cursor, Cline, dan official OpenAI SDK. Cukup arahkan <code>baseURL</code> ke gateway.
            </p>
          </div>

          <div className="doc-feature-card">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Flame size={16} color="#d97706" style={{ flexShrink: 0 }} />
              <strong style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)" }}>DeepSeek R1 Thinking Engine</strong>
            </div>
            <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0, lineHeight: 1.55 }}>
              Dukungan penuh untuk pemikiran mendalam (Reasoning). Monolog pemikiran dialirkan ke accordion Thought di Codex dan dipertahankan dalam history.
            </p>
          </div>

          <div className="doc-feature-card">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <ShieldCheck size={16} color="#059669" style={{ flexShrink: 0 }} />
              <strong style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)" }}>Per-Key Rate Limits & Fallback</strong>
            </div>
            <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0, lineHeight: 1.55 }}>
              Otomatis melakukan smart failover ke model atau upstream alternatif saat terjadi HTTP 429 atau kuota habis tanpa memutus koneksi client.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="docs-tabs-nav">
          <button
            onClick={() => setActiveTab("opencode")}
            className={`docs-tab-btn ${activeTab === "opencode" ? "active" : ""}`}
          >
            <Bot size={15} color={activeTab === "opencode" ? "#2563eb" : "#64748b"} />
            <span>OpenCode & Aidev CLI</span>
            <span className="docs-tab-tag cyan">Prioritas</span>
          </button>

          <button
            onClick={() => setActiveTab("codex")}
            className={`docs-tab-btn ${activeTab === "codex" ? "active" : ""}`}
          >
            <Laptop size={15} color={activeTab === "codex" ? "#2563eb" : "#64748b"} />
            <span>Codex Desktop</span>
            <span className="docs-tab-tag emerald">Reasoning</span>
          </button>

          <button
            onClick={() => setActiveTab("other-agents")}
            className={`docs-tab-btn ${activeTab === "other-agents" ? "active" : ""}`}
          >
            <Layers size={15} color={activeTab === "other-agents" ? "#2563eb" : "#64748b"} />
            <span>Agent Lain (Claude, Cursor, Cline)</span>
          </button>

          <button
            onClick={() => setActiveTab("sdks")}
            className={`docs-tab-btn ${activeTab === "sdks" ? "active" : ""}`}
          >
            <Code2 size={15} color={activeTab === "sdks" ? "#2563eb" : "#64748b"} />
            <span>Official SDKs (Python, TS, cURL)</span>
          </button>

          <button
            onClick={() => setActiveTab("api")}
            className={`docs-tab-btn ${activeTab === "api" ? "active" : ""}`}
          >
            <Server size={15} color={activeTab === "api" ? "#2563eb" : "#64748b"} />
            <span>API Reference</span>
          </button>
        </div>

        {/* Tab 1: OpenCode & Aidev CLI */}
        {activeTab === "opencode" && (
          <div>
            <div className="docs-alert cyan">
              <div className="docs-alert-title">
                <Bot size={16} />
                <span>Integrasi OpenCode CLI & Aidev CLI</span>
              </div>
              <p className="docs-alert-body">
                <strong>OpenCode</strong> adalah autonomous coding agent berbasis terminal. AI Gateway kita mendukung OpenCode secara langsung melalui paket provider standar <code>@ai-sdk/openai-compatible</code> atau via environment variables. Gateway otomatis melakukan normalisasi namespace prefix (misal <code>aidev_gateway/deepseek-reasoner</code>) sehingga tidak terjadi error saat pemanggilan model.
              </p>
            </div>

            {/* Method 1: opencode.json */}
            <div className="code-window">
              <div className="code-window-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div className="code-window-dots">
                    <span className="code-dot red" />
                    <span className="code-dot yellow" />
                    <span className="code-dot green" />
                  </div>
                  <span className="code-window-title">
                    <FileJson size={13} color="#0891b2" />
                    <span>Metode 1: opencode.json (Project-Level atau Global Config)</span>
                  </span>
                </div>
                <button
                  className="btn-copy"
                  onClick={() => handleCopy(openCodeJsonSnippet, "opencode_json")}
                >
                  {copiedSection === "opencode_json" ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                  <span>{copiedSection === "opencode_json" ? "Copied!" : "Copy JSON"}</span>
                </button>
              </div>
              <div className="code-window-banner">
                Simpan file konfigurasi ini pada root proyek Anda sebagai <code>opencode.json</code> atau secara global di:
                <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--ink)" }}>
                  <span>• Linux / macOS: <code>~/.config/opencode/opencode.json</code></span>
                  <span>• Windows: <code>%USERPROFILE%\.config\opencode\opencode.json</code></span>
                </div>
              </div>
              <pre className="code-window-body language-json">
                <code className="language-json">{openCodeJsonSnippet}</code>
              </pre>
            </div>

            {/* Method 2: Environment Variables */}
            <div className="docs-grid-2">
              <div className="code-window" style={{ marginBottom: 0 }}>
                <div className="code-window-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div className="code-window-dots">
                      <span className="code-dot red" />
                      <span className="code-dot yellow" />
                      <span className="code-dot green" />
                    </div>
                    <span className="code-window-title">
                      <Terminal size={13} color="#7c3aed" />
                      <span>Metode 2A: Linux & macOS (Bash / Zsh)</span>
                    </span>
                  </div>
                  <button
                    className="btn-copy"
                    onClick={() => handleCopy(openCodeBashSnippet, "opencode_bash")}
                  >
                    {copiedSection === "opencode_bash" ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                    <span>{copiedSection === "opencode_bash" ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
                <pre className="code-window-body language-bash">
                  <code className="language-bash">{openCodeBashSnippet}</code>
                </pre>
              </div>

              <div className="code-window" style={{ marginBottom: 0 }}>
                <div className="code-window-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div className="code-window-dots">
                      <span className="code-dot red" />
                      <span className="code-dot yellow" />
                      <span className="code-dot green" />
                    </div>
                    <span className="code-window-title">
                      <Terminal size={13} color="#2563eb" />
                      <span>Metode 2B: Windows (PowerShell) & Aidev CLI</span>
                    </span>
                  </div>
                  <button
                    className="btn-copy"
                    onClick={() => handleCopy(openCodePowershellSnippet, "opencode_ps")}
                  >
                    {copiedSection === "opencode_ps" ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                    <span>{copiedSection === "opencode_ps" ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
                <pre className="code-window-body language-bash">
                  <code className="language-bash">{openCodePowershellSnippet}</code>
                </pre>
              </div>
            </div>

            {/* Quick Tips Box */}
            <div className="docs-tips-card">
              <div className="docs-tips-header">
                <Sparkles size={15} color="#d97706" />
                <span>Tips Praktis OpenCode dengan AI Gateway</span>
              </div>
              <ul className="docs-tips-list">
                <li>
                  <strong>Sinkronisasi Model Otomatis:</strong> OpenCode dan Aidev CLI mendeteksi seluruh model aktif melalui endpoint <code>GET /v1/models</code>. Model Combo (seperti <code>gpt-5.2</code>, <code>claude-3-7-sonnet</code>) maupun model provider langsung (seperti <code>deepseek-reasoner</code>) siap digunakan tanpa konfigurasi manual rumit.
                </li>
                <li>
                  <strong>Mode Reasoning DeepSeek R1:</strong> Gunakan model <code>deepseek-reasoner</code> saat menjalankan prompt pemecahan bug atau algoritma kompleks. Gateway kita secara otomatis mengalirkan blok reasoning ke console dan CLI.
                </li>
                <li>
                  <strong>Perlindungan Token & Headroom:</strong> Gateway memastikan token headroom minimal 16,384 tokens selalu dialokasikan agar coding agent tidak terpotong di tengah penulisan file panjang.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Tab 2: Codex Desktop */}
        {activeTab === "codex" && (
          <div>
            <div className="docs-alert emerald">
              <div className="docs-alert-title">
                <Laptop size={16} />
                <span>Integrasi Codex Desktop & Realtime Reasoning</span>
              </div>
              <p className="docs-alert-body">
                Codex Desktop menggunakan endpoint protokol modern <code>/v1/responses</code>. Gateway kita mengonversi chat completion standar dan streaming reasoning ke format SSE Responses Protocol dengan integrasi penuh terhadap komponen accordion <strong>Thought</strong>.
              </p>
            </div>

            <div className="code-window">
              <div className="code-window-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div className="code-window-dots">
                    <span className="code-dot red" />
                    <span className="code-dot yellow" />
                    <span className="code-dot green" />
                  </div>
                  <span className="code-window-title">
                    <Settings size={13} color="#059669" />
                    <span>Codex Desktop Configuration (config.json)</span>
                  </span>
                </div>
                <button
                  className="btn-copy"
                  onClick={() => handleCopy(codexConfigSnippet, "codex_config")}
                >
                  {copiedSection === "codex_config" ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                  <span>{copiedSection === "codex_config" ? "Copied!" : "Copy"}</span>
                </button>
              </div>
              <pre className="code-window-body language-json">
                <code className="language-json">{codexConfigSnippet}</code>
              </pre>
            </div>

            <div className="docs-grid-2">
              <div className="docs-info-card">
                <div className="docs-info-card-title">
                  <CheckCircle2 size={15} color="#059669" />
                  <span>Accordion Thought Process</span>
                </div>
                <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6 }}>
                  Pada model DeepSeek Reasoner dan model reasoning lainnya, monolog pemikiran dialirkan ke <code>response.reasoning_summary_text.delta</code>. UI Codex Desktop akan merender accordion <em>Thinking...</em> yang dapat dilipat dan dibuka secara interaktif.
                </p>
              </div>

              <div className="docs-info-card">
                <div className="docs-info-card-title">
                  <CheckCircle2 size={15} color="#059669" />
                  <span>Retensi Riwayat Pemikiran (History)</span>
                </div>
                <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6 }}>
                  Setelah respon selesai dibuat, seluruh teks reasoning dipertahankan dalam <code>finalOutputs</code>. Riwayat monolog pemikiran tidak hilang atau tertimpa saat Anda meninjau kembali percakapan di Codex Desktop.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Other Coding Agents */}
        {activeTab === "other-agents" && (
          <div>
            <div className="docs-grid-2">
              {/* Claude Code */}
              <div className="code-window" style={{ marginBottom: 0 }}>
                <div className="code-window-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div className="code-window-dots">
                      <span className="code-dot red" />
                      <span className="code-dot yellow" />
                      <span className="code-dot green" />
                    </div>
                    <span className="code-window-title">
                      <Terminal size={13} color="#d97706" />
                      <span>Claude Code CLI Integration</span>
                    </span>
                  </div>
                  <button
                    className="btn-copy"
                    onClick={() => handleCopy(claudeCodeSnippet, "claude_code")}
                  >
                    {copiedSection === "claude_code" ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                    <span>{copiedSection === "claude_code" ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
                <pre className="code-window-body language-bash">
                  <code className="language-bash">{claudeCodeSnippet}</code>
                </pre>
              </div>

              {/* Cursor IDE */}
              <div className="code-window" style={{ marginBottom: 0 }}>
                <div className="code-window-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div className="code-window-dots">
                      <span className="code-dot red" />
                      <span className="code-dot yellow" />
                      <span className="code-dot green" />
                    </div>
                    <span className="code-window-title">
                      <Laptop size={13} color="#2563eb" />
                      <span>Cursor IDE Setup Guide</span>
                    </span>
                  </div>
                  <button
                    className="btn-copy"
                    onClick={() => handleCopy(cursorSnippet, "cursor")}
                  >
                    {copiedSection === "cursor" ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                    <span>{copiedSection === "cursor" ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
                <pre className="code-window-body language-typescript">
                  <code className="language-typescript">{cursorSnippet}</code>
                </pre>
              </div>
            </div>

            {/* Cline / Roo-Code */}
            <div className="code-window" style={{ marginTop: "18px" }}>
              <div className="code-window-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div className="code-window-dots">
                    <span className="code-dot red" />
                    <span className="code-dot yellow" />
                    <span className="code-dot green" />
                  </div>
                  <span className="code-window-title">
                    <FileJson size={13} color="#6366f1" />
                    <span>Cline & Roo-Code VS Code Extension (settings.json)</span>
                  </span>
                </div>
                <button
                  className="btn-copy"
                  onClick={() => handleCopy(clineSnippet, "cline")}
                >
                  {copiedSection === "cline" ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                  <span>{copiedSection === "cline" ? "Copied!" : "Copy"}</span>
                </button>
              </div>
              <pre className="code-window-body language-json">
                <code className="language-json">{clineSnippet}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Tab 4: Official SDKs */}
        {activeTab === "sdks" && (
          <div>
            <div className="docs-grid-2">
              {/* Python */}
              <div className="code-window" style={{ marginBottom: 0 }}>
                <div className="code-window-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div className="code-window-dots">
                      <span className="code-dot red" />
                      <span className="code-dot yellow" />
                      <span className="code-dot green" />
                    </div>
                    <span className="code-window-title">
                      <Code2 size={13} color="#2563eb" />
                      <span>Python Official OpenAI SDK (main.py)</span>
                    </span>
                  </div>
                  <button
                    className="btn-copy"
                    onClick={() => handleCopy(pythonSnippet, "python")}
                  >
                    {copiedSection === "python" ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                    <span>{copiedSection === "python" ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
                <pre className="code-window-body language-python">
                  <code className="language-python">{pythonSnippet}</code>
                </pre>
              </div>

              {/* TypeScript / Node */}
              <div className="code-window" style={{ marginBottom: 0 }}>
                <div className="code-window-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div className="code-window-dots">
                      <span className="code-dot red" />
                      <span className="code-dot yellow" />
                      <span className="code-dot green" />
                    </div>
                    <span className="code-window-title">
                      <Code2 size={13} color="#059669" />
                      <span>Node.js / TypeScript Streaming SSE (stream.ts)</span>
                    </span>
                  </div>
                  <button
                    className="btn-copy"
                    onClick={() => handleCopy(nodeSnippet, "node")}
                  >
                    {copiedSection === "node" ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                    <span>{copiedSection === "node" ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
                <pre className="code-window-body language-typescript">
                  <code className="language-typescript">{nodeSnippet}</code>
                </pre>
              </div>
            </div>

            {/* cURL */}
            <div className="code-window" style={{ marginTop: "18px" }}>
              <div className="code-window-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div className="code-window-dots">
                    <span className="code-dot red" />
                    <span className="code-dot yellow" />
                    <span className="code-dot green" />
                  </div>
                  <span className="code-window-title">
                    <Terminal size={13} color="#7c3aed" />
                    <span>Raw cURL / REST API</span>
                  </span>
                </div>
                <button
                  className="btn-copy"
                  onClick={() => handleCopy(curlChatSnippet, "curl_chat")}
                >
                  {copiedSection === "curl_chat" ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                  <span>{copiedSection === "curl_chat" ? "Copied!" : "Copy"}</span>
                </button>
              </div>
              <pre className="code-window-body language-bash">
                <code className="language-bash">{curlChatSnippet}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Tab 5: API Reference */}
        {activeTab === "api" && (
          <div>
            {/* Endpoints Table */}
            <div className="docs-table-card">
              <div className="docs-table-card-header">
                <Server size={16} color="#2563eb" />
                <span>Daftar Endpoint REST API Gateway</span>
              </div>
              <div>
                <div className="docs-table-row">
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span className="docs-method-badge post">POST</span>
                      <code style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "12px", color: "var(--ink)" }}>/v1/chat/completions</code>
                    </div>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "12px" }}>
                      Chat completion standar OpenAI. Mendukung format pesan, tools/function calling, dan streaming SSE.
                    </p>
                  </div>
                  <span className="docs-endpoint-tag green">
                    Streaming & Non-Streaming
                  </span>
                </div>

                <div className="docs-table-row">
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span className="docs-method-badge get">GET</span>
                      <code style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "12px", color: "var(--ink)" }}>/v1/models</code>
                    </div>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "12px" }}>
                      Mengembalikan seluruh model publik aktif yang tersedia di gateway (Combo Models kurasi).
                    </p>
                  </div>
                  <span className="docs-endpoint-tag gray">
                    Model Discovery
                  </span>
                </div>

                <div className="docs-table-row">
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span className="docs-method-badge get">GET</span>
                      <code style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "12px", color: "var(--ink)" }}>/v1/models/:modelId</code>
                    </div>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "12px" }}>
                      Mengambil metadata, kapabilitas (vision, reasoning, tool calling), dan limit context window model spesifik.
                    </p>
                  </div>
                  <span className="docs-endpoint-tag gray">
                    Capabilities Spec
                  </span>
                </div>

                <div className="docs-table-row">
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span className="docs-method-badge post">POST</span>
                      <code style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "12px", color: "var(--ink)" }}>/v1/responses</code>
                    </div>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "12px" }}>
                      Endpoint Responses & Realtime Protocol khusus untuk Codex Desktop, dengan streaming reasoning accordion.
                    </p>
                  </div>
                  <span className="docs-endpoint-tag purple">
                    Codex Protocol
                  </span>
                </div>
              </div>
            </div>

            {/* Headers & Authentication */}
            <div className="docs-grid-2">
              <div className="docs-info-card">
                <div className="docs-info-card-title">
                  <Key size={15} color="#2563eb" />
                  <span>Headers & Autentikasi</span>
                </div>
                <div className="docs-info-item">
                  <div className="docs-info-item-label">Authorization: Bearer &lt;API_KEY&gt;</div>
                  <p className="docs-info-item-desc">Header wajib untuk memverifikasi API Key internal akun Anda.</p>
                </div>
                <div className="docs-info-item">
                  <div className="docs-info-item-label">x-api-key: &lt;API_KEY&gt;</div>
                  <p className="docs-info-item-desc">Header alternatif yang dapat diterima gateway selain Authorization Bearer.</p>
                </div>
                <div className="docs-info-item">
                  <div className="docs-info-item-label">Content-Type: application/json</div>
                  <p className="docs-info-item-desc">Format payload JSON standar untuk seluruh endpoint POST.</p>
                </div>
              </div>

              <div className="docs-info-card">
                <div className="docs-info-card-title">
                  <ShieldCheck size={15} color="#059669" />
                  <span>Status Codes & Error Handling</span>
                </div>
                <div className="docs-info-item">
                  <div className="docs-info-item-label" style={{ color: "#059669" }}>200 OK</div>
                  <p className="docs-info-item-desc">Permintaan sukses dieksekusi atau stream terhubung.</p>
                </div>
                <div className="docs-info-item">
                  <div className="docs-info-item-label" style={{ color: "#dc2626" }}>401 Unauthorized</div>
                  <p className="docs-info-item-desc">API Key tidak valid atau telah dinonaktifkan.</p>
                </div>
                <div className="docs-info-item">
                  <div className="docs-info-item-label" style={{ color: "#d97706" }}>429 Rate Limit</div>
                  <p className="docs-info-item-desc">Batas rate limit tercapai. Gateway otomatis mencoba failover ke upstream cadangan terlebih dahulu.</p>
                </div>
                <div className="docs-info-item">
                  <div className="docs-info-item-label" style={{ color: "#7c3aed" }}>502 Bad Gateway</div>
                  <p className="docs-info-item-desc">Seluruh kandidat model upstream mengalami downtime.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
