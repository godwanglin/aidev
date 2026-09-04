"use client";

import { useEffect, useState } from "react";
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
              <div className="panel-title">
                <h2>
                  <KeyRound size={14} className="text-blue shrink-0" />
                  <span>Personal Usage & Keys Overview</span>
                </h2>
              </div>
              <div className="settings-body">
                <div className="setting-row">
                  <div>
                    <strong>My Active API Keys</strong>
                    <p>API keys generated and scoped to your account.</p>
                  </div>
                  <span className="mono font-semibold">
                    {data?.user?.totalKeys} Keys
                  </span>
                </div>

                <div className="setting-row">
                  <div>
                    <strong>Available Token Balance</strong>
                    <p>Personal token credits ready for AI inference.</p>
                  </div>
                  <span className="mono text-blue font-semibold">
                    {data?.user?.tokenBalance?.toLocaleString()} Tokens
                  </span>
                </div>
              </div>
            </article>

            
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
