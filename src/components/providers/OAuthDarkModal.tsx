"use client";

import React, { useState, useEffect } from "react";
import { X, ExternalLink, Copy, Check, AlertCircle } from "lucide-react";
import { CatalogProviderItem } from "@/lib/oauth/config";
import { parseCallbackUrl } from "@/lib/oauth/pkce";
import { renderProviderIcon, ProviderAvatar } from "@/components/providers/ProviderIcons";

interface OAuthDarkModalProps {
  provider: CatalogProviderItem;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export default function OAuthDarkModal({
  provider,
  onClose,
  onSuccess,
  onError,
}: OAuthDarkModalProps) {
  const isDeviceFlowProvider = provider.id === "CODEBUDDY" || provider.id === "GROK_CLI";

  const [oauthAuthorizeUrl, setOauthAuthorizeUrl] = useState("");
  const [oauthState, setOauthState] = useState("");
  const [oauthCodeVerifier, setOauthCodeVerifier] = useState("");
  const [oauthUserCode, setOauthUserCode] = useState("");
  const [oauthVerificationUri, setOauthVerificationUri] = useState("");
  const [oauthCallbackInput, setOauthCallbackInput] = useState("");
  const [accountName, setAccountName] = useState(
    isDeviceFlowProvider ? "" : `Akun ${provider.name}`
  );
  const [isInitiating, setIsInitiating] = useState(false);
  const [isExchanging, setIsExchanging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [modalError, setModalError] = useState("");

  async function startSession(openPopup = false) {
    setIsInitiating(true);
    setModalError("");
    try {
      const res = await fetch("/api/admin/providers/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider.id,
          name: accountName,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setOauthAuthorizeUrl(json.data.authorizeUrl);
        setOauthState(json.data.state);
        setOauthCodeVerifier(json.data.codeVerifier || "");
        setOauthUserCode(json.data.userCode || "");
        setOauthVerificationUri(json.data.verificationUri || "");

        if (openPopup) {
          const width = 600;
          const height = 700;
          const left = window.screen.width / 2 - width / 2;
          const top = window.screen.height / 2 - height / 2;
          window.open(
            json.data.authorizeUrl,
            `oauth_${provider.id}`,
            `width=${width},height=${height},top=${top},left=${left},toolbar=no,menubar=no`
          );
        }
      } else {
        setModalError(json.error || "Gagal menginisiasi sesi otorisasi OAuth.");
      }
    } catch {
      setModalError("Kesalahan jaringan saat memulai sesi OAuth.");
    }
    setIsInitiating(false);
  }

  useEffect(() => {
    startSession(false);

    // Listen for popup callback message
    function handleMessage(event: MessageEvent) {
      if (event.data && event.data.type === "OAUTH_CALLBACK") {
        const { code, state, error } = event.data;
        if (error) {
          setModalError(`Otorisasi ditolak: ${error}`);
          return;
        }
        if (code) {
          handleExchange(code, state);
        }
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Polling effect for device-flow providers (CodeBuddy & Grok CLI)
  useEffect(() => {
    if (!isDeviceFlowProvider || !oauthState) return;

    let stopped = false;
    const pollDelayMs = provider.id === "GROK_CLI" ? 4500 : 3000;
    const interval = setInterval(async () => {
      if (stopped || isExchanging) return;
      try {
        const res = await fetch("/api/admin/providers/oauth/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: provider.id,
            state: oauthState,
            name: accountName.trim() || undefined,
          }),
        });
        const json = await res.json();
        if (json.success) {
          stopped = true;
          clearInterval(interval);
          onSuccess(
            `Berhasil menghubungkan ${provider.name}${
              json.data?.accountEmail ? ` (${json.data.accountEmail})` : ""
            } via OAuth!`
          );
          onClose();
        } else if (json.error && !json.pending) {
          setModalError(json.error);
        }
      } catch {}
    }, pollDelayMs);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [isDeviceFlowProvider, provider.id, provider.name, oauthState, accountName, isExchanging]);

  async function copyUrl() {
    if (!oauthAuthorizeUrl) return;
    try {
      await navigator.clipboard.writeText(oauthAuthorizeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function copyUserCode() {
    if (!oauthUserCode) return;
    try {
      await navigator.clipboard.writeText(oauthUserCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  }

  async function handleExchange(explicitCode?: string, explicitState?: string) {
    setIsExchanging(true);
    setModalError("");

    let codeToUse = explicitCode;
    let stateToUse = explicitState || oauthState;

    const input = oauthCallbackInput.trim();
    if (!codeToUse && input) {
      const parsed = parseCallbackUrl(input);
      if (parsed.error) {
        setModalError(parsed.error);
        setIsExchanging(false);
        return;
      }
      codeToUse = parsed.code || "";
      if (parsed.state) stateToUse = parsed.state;
    }

    if (!codeToUse) {
      setModalError(
        "URL callback belum mengandung kode otorisasi (?code=...). Pastikan Anda telah mengklik 'Izinkan' di Google/penyedia dan menyalin seluruh alamat URL dari address bar."
      );
      setIsExchanging(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/providers/oauth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider.id,
          name: accountName.trim() || `Akun ${provider.name}`,
          callbackInput: input || codeToUse,
          code: codeToUse,
          state: stateToUse,
          codeVerifier: oauthCodeVerifier,
        }),
      });

      const json = await res.json();
      if (json.success) {
        onSuccess(
          json.data?.replaced
            ? `Berhasil memperbarui akun ${provider.name}${
                json.data?.accountEmail ? ` (${json.data.accountEmail})` : ""
              } (OAuth lama digantikan)!`
            : `Berhasil menghubungkan ${provider.name}${
                json.data?.accountEmail ? ` (${json.data.accountEmail})` : ""
              } via OAuth!`
        );
        onClose();
      } else {
        setModalError(json.error || "Pertukaran token OAuth gagal. Periksa kode atau kredensial.");
      }
    } catch {
      setModalError("Gagal menghubungi server untuk pertukaran token OAuth.");
    }
    setIsExchanging(false);
  }

  return (
    <div className="oauth-modal-overlay">
      <div className="oauth-modal-card">
        {/* Berlin Light Clean Modal Header */}
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
            <span className="oauth-tag-badge">OAuth 2.0</span>
          </div>

          <button className="oauth-btn-close" type="button" onClick={onClose} title="Tutup">
            <X size={15} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="oauth-modal-body">
          {modalError && (
            <div className="oauth-alert-error">
              <AlertCircle size={14} className="shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          {/* Waiting Status Banner (Berlin Light Theme) */}
          <div className="oauth-status-banner-light">
            <div className="oauth-status-left">
              <div className="oauth-spinner-blue" />
              <span className="oauth-status-text">
                Menunggu otorisasi popup browser...
              </span>
            </div>
            <button
              type="button"
              className="oauth-btn-reopen"
              onClick={() => startSession(true)}
              disabled={isInitiating}
            >
              <ExternalLink size={11} />
              <span>Buka Ulang Popup</span>
            </button>
          </div>

          {/* Divider */}
          <div className="oauth-divider-clean">
            <span>Atau Salin &amp; Tempel Callback URL Manual</span>
          </div>

          {/* Step 1: Open URL */}
          <div className="oauth-step-block">
            <label className="oauth-step-label">
              Langkah 1: Buka URL Otorisasi di Browser
            </label>
            <div className="oauth-input-action-row">
              <input
                type="text"
                readOnly
                className="oauth-input-control readonly"
                value={oauthAuthorizeUrl || "Menyiapkan sesi otorisasi..."}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                className="oauth-copy-btn-light"
                onClick={copyUrl}
                disabled={!oauthAuthorizeUrl}
              >
                {copied ? (
                  <>
                    <Check size={12} className="text-[var(--green)]" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Salin</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step 2: Paste Callback or Auto-Poll note */}
          {provider.id === "GROK_CLI" ? (
            <>
              <div className="oauth-step-block">
                <label className="oauth-step-label">
                  Langkah 2: Masukkan Kode Perangkat (Device Code) di Browser
                </label>
                <div className="oauth-input-action-row">
                  <input
                    type="text"
                    readOnly
                    className="oauth-input-control readonly font-mono font-bold tracking-widest text-center text-base"
                    value={oauthUserCode || "Memuat kode..."}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    className="oauth-copy-btn-light"
                    onClick={copyUserCode}
                    disabled={!oauthUserCode}
                  >
                    {copiedCode ? (
                      <>
                        <Check size={12} className="text-[var(--green)]" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Salin Kode</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="oauth-step-subtext" style={{ marginTop: "6px" }}>
                  Buka URL di atas atau{" "}
                  <code>{oauthVerificationUri || "https://accounts.x.ai/oauth2/device"}</code> di
                  browser, login ke akun xAI/Grok Anda, lalu setujui otorisasi kode di atas. Sistem
                  ini akan otomatis mendeteksi keberhasilan login dalam beberapa detik.
                </p>
              </div>
            </>
          ) : provider.id === "CODEBUDDY" ? (
            <div className="oauth-step-block">
              <label className="oauth-step-label">
                Langkah 2: Otorisasi Otomatis
              </label>
              <p className="oauth-step-subtext">
                Buka URL di atas pada browser, lakukan login ke akun CodeBuddy. Sistem gateway ini akan otomatis mendeteksi keberhasilan login dan menghubungkan akun Anda dalam beberapa detik.
              </p>
            </div>
          ) : (
            <div className="oauth-step-block">
              <label className="oauth-step-label">
                Langkah 2: Tempelkan URL Callback dari Browser
              </label>
              <p className="oauth-step-subtext">
                Setelah login, salin seluruh URL dari address bar browser (misal:{" "}
                {provider.id === "XAI" ? (
                  <code>http://127.0.0.1:56121/callback?code=...&amp;state=...</code>
                ) : (
                  <>
                    <code>http://localhost:1455/auth/callback?code=...</code> atau{" "}
                    <code>http://localhost:443/...</code>
                  </>
                )}
                ). Abaikan jika browser menampilkan <i>&apos;This site can&apos;t be reached&apos;</i>.
              </p>
              <input
                type="text"
                className="oauth-input-control"
                value={oauthCallbackInput}
                onChange={(e) => setOauthCallbackInput(e.target.value)}
                placeholder={
                  provider.id === "XAI"
                    ? "http://127.0.0.1:56121/callback?code=...&state=..."
                    : "http://localhost:.../callback?code=...&state=..."
                }
              />
            </div>
          )}

          {/* Optional Account Label */}
          <div className="oauth-step-block">
            <label className="oauth-step-label">
              Label / Nama Akun (Opsional)
            </label>
            <input
              type="text"
              className="oauth-input-control"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder={
                isDeviceFlowProvider
                  ? `Otomatis dari profil akun ${provider.name} (atau isi kustom)`
                  : `Contoh: Akun ${provider.name} Utama`
              }
            />
          </div>
        </div>

        {/* Berlin Modal Actions Footer */}
        <div className="oauth-modal-footer-clean">
          <button
            type="button"
            className="oauth-footer-cancel-btn"
            onClick={onClose}
            disabled={isExchanging}
          >
            Batal
          </button>
          {isDeviceFlowProvider ? (
            <button
              type="button"
              className="oauth-footer-submit-btn"
              onClick={async () => {
                if (!oauthState) return;
                setIsExchanging(true);
                try {
                  const res = await fetch("/api/admin/providers/oauth/poll", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      provider: provider.id,
                      state: oauthState,
                      name: accountName.trim() || undefined,
                    }),
                  });
                  const json = await res.json();
                  if (json.success) {
                    onSuccess(
                      `Berhasil menghubungkan ${provider.name}${
                        json.data?.accountEmail ? ` (${json.data.accountEmail})` : ""
                      } via OAuth!`
                    );
                    onClose();
                  } else if (json.pending) {
                    setModalError("Login belum selesai di browser. Silakan selesaikan login terlebih dahulu.");
                  } else {
                    setModalError(json.error || "Gagal mendapatkan status login");
                  }
                } catch {
                  setModalError("Gagal menghubungi server untuk polling status.");
                }
                setIsExchanging(false);
              }}
              disabled={isExchanging || !oauthState}
            >
              {isExchanging ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Memeriksa...</span>
                </>
              ) : (
                <span>Periksa Status Login</span>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="oauth-footer-submit-btn"
              onClick={() => handleExchange()}
              disabled={!oauthCallbackInput.trim() || isExchanging}
            >
              {isExchanging ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Menghubungkan...</span>
                </>
              ) : (
                <span>Hubungkan Akun</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
