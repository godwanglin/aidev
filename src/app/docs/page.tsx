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
} from "lucide-react";

export default function DocsPage() {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  useEffect(() => {
    Prism.highlightAll();
  }, []);

  function handleCopy(code: string, id: string) {
    navigator.clipboard.writeText(code);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  }

  const pythonSnippet = `from openai import OpenAI

# Inisialisasi client mengarah ke AI Gateway kita
client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="sk-int-your-internal-api-key"
)

# Chat completion request
response = client.chat.completions.create(
    model="gpt-5.2",
    messages=[
        {"role": "system", "content": "You are an expert software engineer."},
        {"role": "user", "content": "Write an optimized binary search in Python"}
    ],
    temperature=0.7,
    max_tokens=250
)

print(response.choices[0].message.content)`;

  const nodeSnippet = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:3000/v1",
  apiKey: "sk-int-your-internal-api-key"
});

async function run() {
  // Real-time Server-Sent Events (SSE) streaming
  const stream = await client.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "user", content: "Explain microservices architecture in 3 points." }
    ],
    stream: true,
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || "");
  }
}

run();`;

  const curlSnippet = `curl http://localhost:3000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-int-your-internal-api-key" \\
  -d '{
    "model": "gpt-5.2",
    "messages": [
      {"role": "user", "content": "Hello AI Gateway!"}
    ],
    "max_tokens": 100
  }'`;

  const agentSnippet = `# 1. Setting Environment Variables untuk AI Agents (Cursor / Cline / LangChain)
export OPENAI_BASE_URL="http://localhost:3000/v1"
export OPENAI_API_KEY="sk-int-your-internal-api-key"

# 2. Jalankan autonomous coding agent via terminal
aidev run "Refactor authentication layer and optimize database queries"`;

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="API Documentation"
          subtitle="Developer guide for integrating AI Gateway with OpenAI SDKs, LangChain, Cursor, and Aidev CLI Agent."
        />

        {/* Feature Cards Grid */}
        <div className="docs-cards-grid">
          <div className="doc-feature-card">
            <div className="flex items-center gap-2">
              <Cpu size={15} className="text-blue shrink-0" />
              <strong className="text-xs font-semibold">100% OpenAI Compatible</strong>
            </div>
            <p className="text-xs text-muted m-0">
              Drop-in replacement for official OpenAI SDK. Cukup ganti <code>baseURL</code> ke <code>http://localhost:3000/v1</code>.
            </p>
          </div>

          <div className="doc-feature-card">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-amber-500 shrink-0" />
              <strong className="text-xs font-semibold">Real-Time Streaming (SSE)</strong>
            </div>
            <p className="text-xs text-muted m-0">
              Server-Sent Events (SSE) berkecepatan tinggi dengan pencatatan token dan latensi real-time.
            </p>
          </div>

          <div className="doc-feature-card">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-green shrink-0" />
              <strong className="text-xs font-semibold">Rate Limiting & Token Balance</strong>
            </div>
            <p className="text-xs text-muted m-0">
              Proteksi rate limit per-key (default 30 RPM) dan pemotongan saldo token balance otomatis.
            </p>
          </div>
        </div>

        {/* Code Snippets Window Container */}
        <div className="settings-grid">
          {/* Snippet 1: Python */}
          <div className="code-window">
            <div className="code-window-header">
              <div className="flex items-center gap-3">
                <div className="code-window-dots">
                  <span className="code-dot red" />
                  <span className="code-dot yellow" />
                  <span className="code-dot green" />
                </div>
                <span className="code-window-title">
                  <Code2 size={13} className="text-blue" />
                  <span>main.py &mdash; Python SDK Integration</span>
                </span>
              </div>
              <button
                className="btn-copy"
                onClick={() => handleCopy(pythonSnippet, "python")}
              >
                {copiedSection === "python" ? <Check size={12} className="text-green" /> : <Copy size={12} />}
                <span>{copiedSection === "python" ? "Copied!" : "Copy"}</span>
              </button>
            </div>
            <pre className="code-window-body language-python">
              <code className="language-python">{pythonSnippet}</code>
            </pre>
          </div>

          {/* Snippet 2: TypeScript / Node.js */}
          <div className="code-window">
            <div className="code-window-header">
              <div className="flex items-center gap-3">
                <div className="code-window-dots">
                  <span className="code-dot red" />
                  <span className="code-dot yellow" />
                  <span className="code-dot green" />
                </div>
                <span className="code-window-title">
                  <Code2 size={13} className="text-green" />
                  <span>stream.ts &mdash; Node.js / TypeScript (Streaming SSE)</span>
                </span>
              </div>
              <button
                className="btn-copy"
                onClick={() => handleCopy(nodeSnippet, "node")}
              >
                {copiedSection === "node" ? <Check size={12} className="text-green" /> : <Copy size={12} />}
                <span>{copiedSection === "node" ? "Copied!" : "Copy"}</span>
              </button>
            </div>
            <pre className="code-window-body language-typescript">
              <code className="language-typescript">{nodeSnippet}</code>
            </pre>
          </div>

          {/* Snippet 3: cURL */}
          <div className="code-window">
            <div className="code-window-header">
              <div className="flex items-center gap-3">
                <div className="code-window-dots">
                  <span className="code-dot red" />
                  <span className="code-dot yellow" />
                  <span className="code-dot green" />
                </div>
                <span className="code-window-title">
                  <Terminal size={13} className="text-purple-400" />
                  <span>terminal &mdash; cURL / REST API</span>
                </span>
              </div>
              <button
                className="btn-copy"
                onClick={() => handleCopy(curlSnippet, "curl")}
              >
                {copiedSection === "curl" ? <Check size={12} className="text-green" /> : <Copy size={12} />}
                <span>{copiedSection === "curl" ? "Copied!" : "Copy"}</span>
              </button>
            </div>
            <pre className="code-window-body language-bash">
              <code className="language-bash">{curlSnippet}</code>
            </pre>
          </div>

          {/* Snippet 4: AI Agents & CLI */}
          <div className="code-window">
            <div className="code-window-header">
              <div className="flex items-center gap-3">
                <div className="code-window-dots">
                  <span className="code-dot red" />
                  <span className="code-dot yellow" />
                  <span className="code-dot green" />
                </div>
                <span className="code-window-title">
                  <Layers size={13} className="text-amber-500" />
                  <span>agent-config.sh &mdash; AI Agents & Aidev CLI Setup</span>
                </span>
              </div>
              <button
                className="btn-copy"
                onClick={() => handleCopy(agentSnippet, "agent")}
              >
                {copiedSection === "agent" ? <Check size={12} className="text-green" /> : <Copy size={12} />}
                <span>{copiedSection === "agent" ? "Copied!" : "Copy"}</span>
              </button>
            </div>
            <pre className="code-window-body language-bash">
              <code className="language-bash">{agentSnippet}</code>
            </pre>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
