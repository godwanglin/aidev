"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  Shield,
  Server,
  KeyRound,
  RefreshCw,
  User,
  Save,
  CheckCircle2,
  Lock,
  AlertCircle,
  Coins,
  Crown,
  ArrowRight,
} from "lucide-react";

export default function SettingsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Profile update form state
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const json = await res.json();
      setData(json);
      if (json.user?.name) setName(json.user.name);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    fetchSettings();
  }, []);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSavedSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setTimeout(() => setSavedSuccess(false), 2500);
        fetchSettings();
      } else {
        setErrorMessage(json.error || "Failed to update profile.");
      }
    } catch {
      setErrorMessage("Network error. Please try again.");
    }
    setSaving(false);
  }

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Account Settings & Preferences"
          subtitle="Manage your personal profile, security credentials, and view gateway parameters."
        >
          <button
            className="control btn-inline"
            onClick={fetchSettings}
            title="Refresh"
          >
            <RefreshCw size={13} strokeWidth={1.5} />
            <span>Refresh</span>
          </button>
        </PageHead>

        {loading ? (
          <div className="panel p-6 text-center text-muted">
            Loading settings...
          </div>
        ) : (
          <div className="settings-grid">
            {/* Account Profile Editor */}
            <article className="panel">
              <div className="panel-title">
                <h2>
                  <User size={14} className="text-blue shrink-0" />
                  <span>My Account Profile</span>
                </h2>
                {savedSuccess && (
                  <span className="badge ok flex items-center gap-1">
                    <CheckCircle2 size={12} />
                    Profile Updated
                  </span>
                )}
              </div>

              {errorMessage && (
                <div className="px-4 pt-3">
                  <div className="login-error flex items-center gap-2 mb-0">
                    <AlertCircle size={14} />
                    <span>{errorMessage}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="settings-body">
                <div className="setting-row">
                  <div>
                    <strong>Account Email</strong>
                    <p>Your unique login identifier.</p>
                  </div>
                  <span className="mono font-semibold">{data?.user?.email}</span>
                </div>

                <div className="setting-row">
                  <div>
                    <strong>Display Name</strong>
                    <p>The name displayed across the dashboard.</p>
                  </div>
                  <input suppressHydrationWarning
                    className="control"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your Name"
                    style={{ width: "220px" }}
                    required
                  />
                </div>

                <div className="setting-row">
                  <div>
                    <strong>Current Password</strong>
                    <p>Required only if you want to change your password.</p>
                  </div>
                  <input suppressHydrationWarning
                    type="password"
                    className="control"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    style={{ width: "220px" }}
                  />
                </div>

                <div className="setting-row">
                  <div>
                    <strong>New Password</strong>
                    <p>Leave blank if keeping existing password.</p>
                  </div>
                  <input suppressHydrationWarning
                    type="password"
                    className="control"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    style={{ width: "220px" }}
                  />
                </div>

                <div className="flex justify-end pt-3">
                  <button type="submit" className="primary btn-inline" disabled={saving}>
                    <Save size={13} />
                    <span>{saving ? "Saving..." : "Save Profile Changes"}</span>
                  </button>
                </div>
              </form>
            </article>

            {/* Account Quota Overview */}
            <article className="panel">
              <div className="panel-title flex items-center justify-between">
                <h2>
                  <KeyRound size={14} className="text-blue shrink-0" />
                  <span>Personal Usage & Balance Overview</span>
                </h2>
                <span className="text-[11px] font-semibold text-blue bg-blue/10 px-2.5 py-0.5 rounded-full border border-blue/20 flex items-center gap-1">
                  <Crown size={11} />
                  <span>{data?.user?.subscriptionTier || "FREE"} PLAN</span>
                </span>
              </div>
              <div className="settings-body">
                <div className="setting-row">
                  <div>
                    <strong>Total Saldo Dompet (USD)</strong>
                    <p>Saldo fleksibel siap pakai untuk inferensi model AI tanpa masa kedaluwarsa.</p>
                  </div>
                  <span className="mono font-bold text-base text-emerald-600 dark:text-emerald-400">
                    ${Number(data?.user?.balanceUsd || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </span>
                </div>

                <div className="setting-row">
                  <div>
                    <strong>Kuota Bulanan Paket</strong>
                    <p>Alokasi kuota bulanan berjalan dari paket langganan aktif Anda.</p>
                  </div>
                  <span className="mono font-semibold text-ink">
                    ${Number(Math.max(0, (data?.user?.monthlyBalanceAllocatedUsd || 0) - (data?.user?.monthlyBalanceRemainingUsd || 0))).toFixed(2)} / ${Number(data?.user?.monthlyBalanceAllocatedUsd || 0).toFixed(2)} USD
                  </span>
                </div>

                <div className="setting-row">
                  <div>
                    <strong>My Active API Keys</strong>
                    <p>Jumlah API key aktif yang terhubung dan dikelola di akun Anda.</p>
                  </div>
                  <span className="mono font-semibold text-ink">
                    {data?.user?.totalKeys ?? 0} Keys
                  </span>
                </div>

                <div className="pt-2 flex justify-end">
                  <Link href="/billing" className="control btn-inline text-xs font-semibold hover:border-blue-500/50">
                    <Coins size={13} className="text-amber-500" />
                    <span>Kelola Saldo & Paket Langganan</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            </article>

            
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
