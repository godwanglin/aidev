"use client";

import React, { useState, useMemo } from "react";
import { X, AlertCircle, CheckCircle2, Cookie, Sparkles, ShieldCheck } from "lucide-react";
import { CatalogProviderItem } from "@/lib/oauth/config";
import { ProviderAvatar } from "@/components/providers/ProviderIcons";
import { parseCookieInput } from "@/lib/web-providers/chatgpt-session";

interface WebCookieModalProps {
  provider: CatalogProviderItem;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export default function WebCookieModal({
  provider,
  onClose,
  onSuccess,
  onError,
}: WebCookieModalProps) {
  const [accountName, setAccountName] = useState(`Akun ${provider.name}`);
  const [cookieInput, setCookieInput] = useState("");
  const [formatTab, setFormatTab] = useState<"AUTO" | "JSON" | "HEADERS" | "NETSCAPE">("AUTO");
  const [priority, setPriority] = useState(1);
  const [weight, setWeight] = useState(1);
  const [isVerifying, setIsVerifying] = useState(false);
  const [modalError, setModalError] = useState("");

  // Live client-side parsing feedback
  const parseFeedback = useMemo(() => {
    if (!cookieInput.trim()) return null;
    return parseCookieInput(cookieInput);
  }, [cookieInput]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!cookieInput.trim()) {
      setModalError("Harap masukkan cookie akun terlebih dahulu.");
      return;
    }

    setIsVerifying(true);
    setModalError("");

    try {
      const res = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider.id,
          name: accountName.trim() || `Akun ${provider.name}`,
          authType: "COOKIE",
          apiKey: cookieInput.trim(),
          priority: Number(priority) || 1,
          weight: Number(weight) || 1,
        }),
      });

      const json = await res.json();
      if (res.ok && (json.id || json.success)) {
        onSuccess(
          `Berhasil menghubungkan ${provider.name}${
            json.accountEmail ? ` (${json.accountEmail})` : ""
          } via Cookie Session!`
        );
        onClose();
      } else {
        setModalError(
          json.error || "Gagal memverifikasi sesi cookie akun ChatGPT. Pastikan cookie masih aktif."
        );
      }
    } catch {
      setModalError("Kesalahan jaringan saat memverifikasi sesi cookie.");
    }
    setIsVerifying(false);
  }

  return (
    <div className="oauth-modal-overlay">
      <div className="cookie-modal-card">
        {/* Modal Header */}
        <div className="oauth-modal-header">
          <div className="oauth-modal-title-wrap">
            <ProviderAvatar
              slugOrId={provider.slug || provider.id}
              name={provider.name}
              iconName={provider.iconName}
              brandColor={provider.color}
              size={28}
              imgSize={18}
              className="oauth-provider-badge"
            />
            <h3 className="oauth-modal-title-text">Connect {provider.name}</h3>
            <span
              className="oauth-tag-badge"
              style={{
                background: "#fffbeb",
                color: "#b45309",
                borderColor: "#fde68a",
                fontWeight: 600,
              }}
            >
              LEGACY
            </span>
          </div>

          <button className="oauth-btn-close" type="button" onClick={onClose} title="Tutup">
            <X size={15} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleConnect}>
          <div className="cookie-modal-body">
            {modalError && (
              <div className="oauth-alert-error">
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span style={{ fontSize: "11.5px", lineHeight: 1.4 }}>{modalError}</span>
              </div>
            )}

            {/* Account Label */}
            <div className="cookie-form-group">
              <div className="cookie-form-header-row">
                <label className="cookie-form-label">Nama / Label Akun</label>
                <span className="cookie-form-sublabel">Contoh: ChatGPT Plus Web 1</span>
              </div>
              <input
                type="text"
                className="cookie-input"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="ChatGPT Web Account"
                required
              />
            </div>

            {/* Format Selector Tabs */}
            <div className="cookie-form-group">
              <div className="cookie-form-header-row">
                <label className="cookie-form-label">Format Cookie</label>
                <div className="cookie-format-tabs">
                  <button
                    type="button"
                    onClick={() => setFormatTab("JSON")}
                    className={`cookie-tab-btn ${formatTab === "JSON" ? "active" : ""}`}
                  >
                    JSON (Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormatTab("HEADERS")}
                    className={`cookie-tab-btn ${formatTab === "HEADERS" ? "active" : ""}`}
                  >
                    Headers String (Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormatTab("NETSCAPE")}
                    className={`cookie-tab-btn ${formatTab === "NETSCAPE" ? "active" : ""}`}
                  >
                    Netscape .txt
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormatTab("AUTO")}
                    className={`cookie-tab-btn ${formatTab === "AUTO" ? "active" : ""}`}
                  >
                    Auto-Detect
                  </button>
                </div>
              </div>

              {/* Cookie Content Textarea */}
              <textarea
                className="cookie-textarea"
                value={cookieInput}
                onChange={(e) => setCookieInput(e.target.value)}
                placeholder={
                  formatTab === "JSON"
                    ? '[\n  { "name": "__Secure-next-auth.session-token", "value": "..." },\n  { "name": "oai-did", "value": "..." }\n]'
                    : formatTab === "HEADERS"
                    ? "Cookie: __Secure-next-auth.session-token=...; oai-did=...;\nUser-Agent: Mozilla/5.0 ..."
                    : formatTab === "NETSCAPE"
                    ? ".chatgpt.com\tTRUE\t/\tTRUE\t1790602712\t__Secure-next-auth.session-token\t..."
                    : "Tempelkan Cookie di sini (bisa JSON array dari Cookie-Editor, string 'Cookie: ...' dari DevTools Network, atau format Netscape txt)..."
                }
                required
              />
            </div>

            {/* Live Parser Feedback */}
            {parseFeedback && (
              <div className="cookie-feedback-bar">
                <div className="cookie-feedback-left">
                  <Cookie size={14} style={{ color: "#10a37f" }} />
                  <span>
                    Format: <strong style={{ textTransform: "uppercase" }}>{parseFeedback.format}</strong>{" "}
                    ({parseFeedback.cookieCount} cookie ditemukan)
                  </span>
                </div>
                <div>
                  {parseFeedback.sessionToken ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#059669", fontWeight: 600 }}>
                      <CheckCircle2 size={13} />
                      <span>Session Token Terdeteksi</span>
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#d97706", fontWeight: 600 }}>
                      <AlertCircle size={13} />
                      <span>Belum ada Session Token</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Helper Tips Box */}
            <div className="cookie-guide-box">
              <div className="cookie-guide-title">
                <Sparkles size={12} style={{ color: "#d97706" }} />
                <span>Cara Mendapatkan Cookie Akun Web:</span>
              </div>
              <div>
                1. <strong>Cara Cepat (DevTools)</strong>: Buka <code>chatgpt.com</code> &rarr; tekan <kbd>F12</kbd> &rarr; tab <strong>Network</strong> &rarr; refresh halaman &rarr; klik request apa saja &rarr; salin isi header <code>Cookie</code>.
              </div>
              <div>
                2. <strong>Cara Praktis (Ekstensi Browser)</strong>: Pasang ekstensi <em>Cookie-Editor</em>, klik <strong>Export &rarr; JSON</strong>, lalu tempelkan di atas.
              </div>
            </div>

            {/* Priority & Weight Row */}
            <div className="cookie-grid-2">
              <div className="cookie-form-group">
                <label className="cookie-form-label">Priority (1 = Utama)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="cookie-input"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
              </div>
              <div className="cookie-form-group">
                <label className="cookie-form-label">Weight (Load Balancing)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="cookie-input"
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="cookie-modal-footer">
            <button
              type="button"
              className="oauth-footer-cancel-btn"
              onClick={onClose}
              disabled={isVerifying}
            >
              Batal
            </button>
            <button
              type="submit"
              className="cookie-submit-btn"
              disabled={isVerifying}
            >
              {isVerifying ? (
                <>
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <span>Memverifikasi Sesi...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={14} />
                  <span>Verifikasi & Simpan Akun</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
