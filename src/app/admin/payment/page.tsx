"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  CreditCard,
  QrCode,
  Save,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Lock,
  Building2,
} from "lucide-react";

export default function AdminPaymentSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Form states
  const [serverKey, setServerKey] = useState("");
  const [clientKey, setClientKey] = useState("");
  const [isProduction, setIsProduction] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      const json = await res.json();
      if (json.data) {
        setServerKey(json.data.midtransServerKey || "");
        setClientKey(json.data.midtransClientKey || "");
        setIsProduction(Boolean(json.data.midtransIsProduction));
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    fetchSettings();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          midtransServerKey: serverKey,
          midtransClientKey: clientKey,
          midtransIsProduction: isProduction,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(
          isProduction
            ? "Midtrans beralih ke mode PRODUCTION! Transaksi riil QRIS & VA aktif."
            : "Midtrans beralih ke mode SANDBOX! Transaksi simulasi aktif."
        );
        setTimeout(() => setSuccessMsg(""), 4000);
      } else {
        setErrorMsg(json.error || "Gagal menyimpan konfigurasi.");
      }
    } catch {
      setErrorMsg("Gagal terhubung ke server.");
    }
    setSaving(false);
  }

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Payment Gateway Configuration"
          subtitle="Atur kredensial Midtrans Server Key, Client Key, dan toggle mode Sandbox / Production secara instan tanpa restart server."
        >
          <button className="control btn-inline" onClick={fetchSettings}>
            <RefreshCw size={13} strokeWidth={1.5} />
            <span>Refresh</span>
          </button>
        </PageHead>

        {successMsg && (
          <div className="banner-alert mb-3">
            <CheckCircle2 size={16} className="text-green shrink-0" />
            <div className="banner-text">
              <strong>Berhasil Diperbarui!</strong>
              <p>{successMsg}</p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="login-error mb-3 flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="settings-grid">
          {/* Environment Mode Switch Card */}
          <article className="panel">
            <div className="panel-title flex items-center justify-between">
              <h2>
                <ShieldCheck size={14} className={isProduction ? "text-green" : "text-amber-500"} />
                <span>Status Environment Midtrans</span>
              </h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                  isProduction
                    ? "bg-green-soft text-green border border-green/20"
                    : "bg-amber-soft text-amber border border-amber/20"
                }`}
              >
                {isProduction ? "● Live Production" : "○ Sandbox Test Mode"}
              </span>
            </div>
            <div className="settings-body">
              <div className="setting-row">
                <div>
                  <strong className="text-xs font-semibold text-ink">Mode Environment (Sandbox vs Production)</strong>
                  <p className="text-xs text-muted">
                    Aktifkan Production untuk menerima uang pembayaran asli dari QRIS BCA/GoPay dan Bank VA. Matikan untuk mode testing Sandbox.
                  </p>
                </div>
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={isProduction}
                    onChange={(e) => setIsProduction(e.target.checked)}
                  />
                  <span className="font-semibold text-xs">
                    {isProduction ? "Production Mode" : "Sandbox Mode"}
                  </span>
                </label>
              </div>
            </div>
          </article>

          {/* Credentials Card */}
          <article className="panel">
            <div className="panel-title">
              <h2>
                <Lock size={14} className="text-blue" />
                <span>Kredensial API Midtrans</span>
              </h2>
            </div>
            <div className="settings-body flex flex-col gap-3">
              <div className="form-group mb-0">
                <label className="text-xs font-semibold mb-1 block text-ink">
                  Midtrans Server Key ({isProduction ? "Production: Mid-server-..." : "Sandbox: SB-Mid-server-..."})
                </label>
                <input
                  suppressHydrationWarning
                  type="password"
                  className="control w-full font-mono text-xs"
                  placeholder="Mid-server-xxxx / SB-Mid-server-xxxx"
                  value={serverKey}
                  onChange={(e) => setServerKey(e.target.value)}
                  required
                />
                <small className="text-muted block mt-1 text-[11px]">
                  Ditemukan di Dashboard Midtrans &rarr; Settings &rarr; Access Keys.
                </small>
              </div>

              <div className="form-group mb-0">
                <label className="text-xs font-semibold mb-1 block text-ink">
                  Midtrans Client Key ({isProduction ? "Production: Mid-client-..." : "Sandbox: SB-Mid-client-..."})
                </label>
                <input
                  suppressHydrationWarning
                  type="text"
                  className="control w-full font-mono text-xs"
                  placeholder="Mid-client-xxxx / SB-Mid-client-xxxx"
                  value={clientKey}
                  onChange={(e) => setClientKey(e.target.value)}
                  required
                />
              </div>

              {/* Webhook Endpoint Guide */}
              <div className="p-3 bg-[#f8fafc] border border-[var(--line)] rounded text-xs flex flex-col gap-1.5 mt-2">
                <strong className="text-ink text-xs">URL Webhook Notifikasi (Pasang di Dashboard Midtrans):</strong>
                <code className="text-blue font-mono bg-white p-1.5 border border-[var(--line-subtle)] rounded select-all break-all text-[11.5px]">
                  http://your-domain.com/api/webhooks/midtrans
                </code>
                <small className="text-muted text-[11px]">
                  Pasang URL di atas pada menu Midtrans Dashboard &rarr; Settings &rarr; Configuration &rarr; Payment Notification URL.
                </small>
              </div>

              <div className="flex justify-end pt-2">
                <button type="submit" className="primary btn-inline" disabled={saving}>
                  <Save size={13} />
                  <span>{saving ? "Menyimpan..." : "Simpan Konfigurasi Midtrans"}</span>
                </button>
              </div>
            </div>
          </article>
        </form>
      </div>
    </DashboardShell>
  );
}
