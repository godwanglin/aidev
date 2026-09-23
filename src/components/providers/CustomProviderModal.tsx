"use client";

import React, { useState } from "react";
import { CheckCircle2, AlertCircle, RefreshCw, Bot } from "lucide-react";
import CustomDropdown from "@/components/CustomDropdown";

interface CustomProviderModalProps {
  initialCompatibility?: "OPENAI" | "ANTHROPIC";
  defaultProviderName?: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export default function CustomProviderModal({
  initialCompatibility = "OPENAI",
  defaultProviderName = "",
  onClose,
  onSuccess,
  onError,
}: CustomProviderModalProps) {
  const isAnthropicInitial = initialCompatibility === "ANTHROPIC";
  const defaultApiType = isAnthropicInitial ? "Anthropic Messages" : "Chat Completions";
  const defaultBaseUrl = isAnthropicInitial ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1";

  const [name, setName] = useState(defaultProviderName);
  const [prefix, setPrefix] = useState("");
  const [apiType, setApiType] = useState<"Chat Completions" | "Anthropic Messages">(defaultApiType);
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("");

  // Check state
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState<{
    tested: boolean;
    ok: boolean;
    message: string;
    latency?: number;
  } | null>(null);

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Auto-slugify prefix when name changes if user hasn't explicitly set prefix
  const [prefixTouched, setPrefixTouched] = useState(false);

  function handleNameChange(val: string) {
    setName(val);
    if (!prefixTouched) {
      const slug = val
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9_-]/g, "-")
        .replace(/^-+|-+$/g, "");
      setPrefix(slug);
    }
  }

  // Live upstream ping check
  async function handleCheck() {
    if (!baseUrl.trim()) {
      setFormError("Base URL wajib diisi sebelum melakukan pengecekan.");
      return;
    }

    setIsChecking(true);
    setFormError("");
    setCheckStatus(null);

    try {
      const res = await fetch("/api/admin/providers/custom/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim() || undefined,
          modelId: modelId.trim() || undefined,
          apiType,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setCheckStatus({
          tested: true,
          ok: true,
          message: json.message || "Endpoint aktif & valid",
          latency: json.latencyMs,
        });
      } else {
        setCheckStatus({
          tested: true,
          ok: false,
          message: json.error || "Gagal menghubungi endpoint upstream",
          latency: json.latencyMs,
        });
      }
    } catch (err: any) {
      setCheckStatus({
        tested: true,
        ok: false,
        message: "Kesalahan jaringan saat melakukan ping upstream",
      });
    }
    setIsChecking(false);
  }

  // Save / Create provider
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Nama provider wajib diisi.");
      return;
    }
    if (!baseUrl.trim()) {
      setFormError("Base URL wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      const res = await fetch("/api/admin/providers/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          prefix: prefix.trim() || name.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
          apiType,
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim() || undefined,
          modelId: modelId.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        onSuccess(`Provider "${name.trim()}" berhasil dibuat!`);
        onClose();
      } else {
        setFormError(json.error || "Gagal membuat custom provider.");
      }
    } catch {
      setFormError("Terjadi kesalahan jaringan saat menyimpan provider.");
    }
    setIsSubmitting(false);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ width: "500px", maxWidth: "94vw" }}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-wrap">
            <Bot size={16} className="text-blue shrink-0" />
            <h3 className="modal-title-text">
              {apiType === "Anthropic Messages"
                ? "Add Anthropic Compatible Provider"
                : "Add OpenAI Compatible Provider"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-close"
            title="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Error Alert */}
        {formError && (
          <div className="login-error text-xs p-2.5 mb-3 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0 text-red" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-1">
          {/* 1. Name */}
          <div className="form-group mb-3">
            <label className="text-xs font-semibold mb-1 block">Provider Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Contoh: Ipeenk atau Custom OpenAI"
              className="control w-full text-xs"
            />
            <p className="text-[11px] text-muted mt-1">Nama provider yang akan ditampilkan di katalog.</p>
          </div>

          {/* 2. Prefix */}
          <div className="form-group mb-3">
            <label className="text-xs font-semibold mb-1 block">Model Prefix *</label>
            <input
              type="text"
              required
              value={prefix}
              onChange={(e) => {
                setPrefix(e.target.value);
                setPrefixTouched(true);
              }}
              placeholder="contoh: ipeenk"
              className="control w-full text-xs mono"
            />
            <p className="text-[11px] text-muted mt-1">
              Prefix model gateway (misal: <code>{prefix || "prefix"}/gpt-5.5</code>).
            </p>
          </div>

          {/* 3. API Type */}
          <div className="form-group mb-3">
            <label className="text-xs font-semibold mb-1 block">API Type</label>
            <CustomDropdown
              size="md"
              width="100%"
              value={apiType}
              onChange={(val: any) => {
                setApiType(val);
                if (val === "Anthropic Messages" && baseUrl.includes("openai")) {
                  setBaseUrl("https://api.anthropic.com/v1");
                } else if (val === "Chat Completions" && baseUrl.includes("anthropic")) {
                  setBaseUrl("https://api.openai.com/v1");
                }
              }}
              options={[
                { value: "Chat Completions", label: "Chat Completions (OpenAI Compatible)" },
                { value: "Anthropic Messages", label: "Anthropic Messages" },
              ]}
            />
          </div>

          {/* 4. Base URL */}
          <div className="form-group mb-3">
            <label className="text-xs font-semibold mb-1 block">Base URL *</label>
            <input
              type="url"
              required
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="control w-full text-xs mono"
            />
            <p className="text-[11px] text-muted mt-1">
              Base URL upstream (berakhiran /v1) untuk API {apiType === "Anthropic Messages" ? "Anthropic" : "OpenAI"}-compatible.
            </p>
          </div>

          {/* 5. API Key (for Check) */}
          <div className="form-group mb-3">
            <label className="text-xs font-semibold mb-1 block">API Key (Opsional untuk Check)</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="control w-full text-xs mono"
            />
            <p className="text-[11px] text-muted mt-1">
              Kunci API untuk pengujian koneksi. Kunci ini juga otomatis disimpan sebagai koneksi pertama.
            </p>
          </div>

          {/* 6. Model ID (optional) */}
          <div className="form-group mb-3">
            <label className="text-xs font-semibold mb-1 block">Model ID (Opsional untuk Check)</label>
            <input
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="e.g. gpt-4, claude-3-opus"
              className="control w-full text-xs mono"
            />
            <p className="text-[11px] text-muted mt-1">
              Jika upstream tidak mendukung <code>/models</code>, masukkan ID model untuk validasi via completions.
            </p>
          </div>

          {/* Test Connection Check Section */}
          <div className="p-3 rounded-lg bg-[#f8fafc] border border-[var(--border)] mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleCheck}
              disabled={isChecking || !baseUrl.trim()}
              className="control btn-inline text-xs flex items-center gap-1.5"
            >
              {isChecking ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <span>Test Connection</span>
              )}
            </button>

            {checkStatus && (
              <div
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded ${
                  checkStatus.ok
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {checkStatus.ok ? (
                  <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                ) : (
                  <AlertCircle size={13} className="text-red-600 shrink-0" />
                )}
                <span>
                  {checkStatus.message}
                  {checkStatus.latency ? ` (${checkStatus.latency}ms)` : ""}
                </span>
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="modal-actions flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="control text-xs"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="primary btn-inline text-xs"
            >
              {isSubmitting ? "Menyimpan..." : "Simpan & Buat Provider"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
