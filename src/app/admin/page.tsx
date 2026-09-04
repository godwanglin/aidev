"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  Tag,
  Clock,
  Zap,
  Save,
  CheckCircle2,
  AlertCircle,
  Percent,
  Flame,
  UserCheck,
} from "lucide-react";

export default function AdminDiscountPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Form states
  const [promoActive, setPromoActive] = useState(false);
  const [promoPct, setPromoPct] = useState(15);
  const [promoHours, setPromoHours] = useState(24);

  const [firstTopupActive, setFirstTopupActive] = useState(true);
  const [firstTopupPct, setFirstTopupPct] = useState(20);

  const [highUsageActive, setHighUsageActive] = useState(true);
  const [highUsagePct, setHighUsagePct] = useState(10);
  const [highUsageDays, setHighUsageDays] = useState(3);

  async function fetchConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/discounts");
      const json = await res.json();
      if (json.config) {
        setConfig(json.config);
        setPromoActive(json.config.promoDiscountActive);
        setPromoPct(json.config.promoDiscountPct || 15);
        setFirstTopupActive(json.config.firstTopupDiscountActive);
        setFirstTopupPct(json.config.firstTopupDiscountPct || 20);
        setHighUsageActive(json.config.highUsageDiscountActive);
        setHighUsagePct(json.config.highUsageDiscountPct || 10);
        setHighUsageDays(json.config.highUsageDays || 3);
      } else if (json.error) {
        setErrorMsg(json.error);
      }
    } catch {
      setErrorMsg("Failed to connect to admin API.");
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchConfig();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promoDiscountActive: promoActive,
          promoDiscountPct: Number(promoPct),
          promoDurationHours: Number(promoHours),
          firstTopupDiscountActive: firstTopupActive,
          firstTopupDiscountPct: Number(firstTopupPct),
          highUsageDiscountActive: highUsageActive,
          highUsageDiscountPct: Number(highUsagePct),
          highUsageDays: Number(highUsageDays),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg("Discount strategies saved & applied globally!");
        setTimeout(() => setSuccessMsg(""), 3000);
        fetchConfig();
      } else {
        setErrorMsg(json.error || "Failed to update discounts.");
      }
    } catch {
      setErrorMsg("Network error.");
    }
    setSaving(false);
  }

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Admin Discount Master Control"
          subtitle="Configure promotional flash sales, newcomer discounts, and high-usage loyalty rewards."
        />

        {successMsg && (
          <div className="banner-alert mb-3">
            <CheckCircle2 size={16} className="text-green" />
            <div className="banner-text">
              <strong>Success!</strong>
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

        {loading ? (
          <div className="panel p-6 text-center text-muted">Loading discount settings...</div>
        ) : (
          <form onSubmit={handleSave} className="settings-grid">
            {/* Strategy 1: First-Time Top-up Discount */}
            <article className="panel">
              <div className="panel-title">
                <h2>
                  <UserCheck size={14} className="text-blue shrink-0" />
                  <span>1. Newcomer First Top-Up Discount (Auto-Applied)</span>
                </h2>
                <label className="switch-label">
                  <input suppressHydrationWarning
                    type="checkbox"
                    checked={firstTopupActive}
                    onChange={(e) => setFirstTopupActive(e.target.checked)}
                  />
                  <span>{firstTopupActive ? "Active" : "Disabled"}</span>
                </label>
              </div>
              <div className="settings-body">
                <p className="text-xs text-muted mb-3">
                  Automatically discounts user token purchase if they have 0 previous top-up history.
                </p>
                <div className="setting-row">
                  <div>
                    <strong>Discount Rate (%)</strong>
                    <p>Applied exclusively on user first invoice.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <input suppressHydrationWarning
                      type="number"
                      className="control"
                      style={{ width: "90px" }}
                      value={firstTopupPct}
                      onChange={(e) => setFirstTopupPct(Number(e.target.value))}
                      min="1"
                      max="90"
                    />
                    <span className="text-xs font-semibold">%</span>
                  </div>
                </div>
              </div>
            </article>

            {/* Strategy 2: Admin Flash Sale Promo */}
            <article className="panel">
              <div className="panel-title">
                <h2>
                  <Flame size={14} className="text-red shrink-0" />
                  <span>2. Global Flash Sale Promo (Max 1x Use per Period)</span>
                </h2>
                <label className="switch-label">
                  <input suppressHydrationWarning
                    type="checkbox"
                    checked={promoActive}
                    onChange={(e) => setPromoActive(e.target.checked)}
                  />
                  <span>{promoActive ? "Active" : "Disabled"}</span>
                </label>
              </div>
              <div className="settings-body">
                <p className="text-xs text-muted mb-3">
                  Admin can enable custom discount rate with an automatic expiration countdown.
                </p>
                <div className="setting-row">
                  <div>
                    <strong>Promo Discount Rate (%)</strong>
                    <p>Percentage off on all token packages.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <input suppressHydrationWarning
                      type="number"
                      className="control"
                      style={{ width: "90px" }}
                      value={promoPct}
                      onChange={(e) => setPromoPct(Number(e.target.value))}
                      min="1"
                      max="90"
                    />
                    <span className="text-xs font-semibold">%</span>
                  </div>
                </div>

                <div className="setting-row">
                  <div>
                    <strong>Duration (Hours from now)</strong>
                    <p>
                      {config?.promoExpiresAt && new Date(config.promoExpiresAt) > new Date()
                        ? `Currently active until: ${new Date(config.promoExpiresAt).toLocaleString()}`
                        : "Promo inactive"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <input suppressHydrationWarning
                      type="number"
                      className="control"
                      style={{ width: "90px" }}
                      value={promoHours}
                      onChange={(e) => setPromoHours(Number(e.target.value))}
                      min="1"
                      max="720"
                    />
                    <span className="text-xs font-semibold">Hours</span>
                  </div>
                </div>
              </div>
            </article>

            {/* Strategy 3: High Token Usage Loyalty Reward */}
            <article className="panel">
              <div className="panel-title">
                <h2>
                  <Zap size={14} className="text-green shrink-0" />
                  <span>3. Heavy Usage VIP Loyalty Reward (3-Days Reward)</span>
                </h2>
                <label className="switch-label">
                  <input suppressHydrationWarning
                    type="checkbox"
                    checked={highUsageActive}
                    onChange={(e) => setHighUsageActive(e.target.checked)}
                  />
                  <span>{highUsageActive ? "Active" : "Disabled"}</span>
                </label>
              </div>
              <div className="settings-body">
                <p className="text-xs text-muted mb-3">
                  Accounts that heavily consume tokens get an automatic discount voucher valid for 3 days.
                </p>
                <div className="setting-row">
                  <div>
                    <strong>Loyalty Discount Rate (%)</strong>
                    <p>Reward percentage given to heavy token users.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <input suppressHydrationWarning
                      type="number"
                      className="control"
                      style={{ width: "90px" }}
                      value={highUsagePct}
                      onChange={(e) => setHighUsagePct(Number(e.target.value))}
                      min="1"
                      max="90"
                    />
                    <span className="text-xs font-semibold">%</span>
                  </div>
                </div>

                <div className="setting-row">
                  <div>
                    <strong>Reward Validity Period (Days)</strong>
                    <p>Default: 3 Days from reward qualification.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <input suppressHydrationWarning
                      type="number"
                      className="control"
                      style={{ width: "90px" }}
                      value={highUsageDays}
                      onChange={(e) => setHighUsageDays(Number(e.target.value))}
                      min="1"
                      max="30"
                    />
                    <span className="text-xs font-semibold">Days</span>
                  </div>
                </div>
              </div>
            </article>

            <div className="flex justify-end pt-2">
              <button type="submit" className="primary btn-inline" disabled={saving}>
                <Save size={13} />
                <span>{saving ? "Saving Changes..." : "Save Discount Strategy"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </DashboardShell>
  );
}
