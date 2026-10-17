"use client";

import React, { useState } from "react";
import { Edit, X, Layers, Plus, ShieldAlert, CheckCircle2 } from "lucide-react";

export interface ConnectionItem {
  id: string;
  provider: string;
  name: string;
  authType?: "API_KEY" | "OAUTH" | "COOKIE";
  accountEmail?: string | null;
  maskedApiKey?: string | null;
  apiKey?: string;
  tokenExpiresAt?: string | null;
  syncStatus: "NORMAL" | "LOW_QUOTA" | "EXHAUSTED" | "ERROR";
  quotaStatus?: "NORMAL" | "LOW_QUOTA" | "EXHAUSTED" | "ERROR";
  priority: number;
  weight?: number;
  isActive: boolean;
  active?: boolean;
  baseUrl?: string | null;
  compatibility?: string | null;
  lastSyncedAt?: string | null;
  customModels?: string[] | string | null;
  disallowedModels?: string[] | string | null;
}

interface EditConnectionModalProps {
  connection: ConnectionItem;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

function parseInitialModels(val?: string[] | string | null): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
      } catch {}
    }
    return trimmed.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export default function EditConnectionModal({
  connection,
  onClose,
  onSuccess,
  onError,
}: EditConnectionModalProps) {
  const [name, setName] = useState(connection.name);
  const [apiKey, setApiKey] = useState("");
  const [accountEmail, setAccountEmail] = useState(connection.accountEmail || "");
  const [baseUrl, setBaseUrl] = useState(connection.baseUrl || "");
  const [priority, setPriority] = useState(connection.priority || 1);
  const [weight, setWeight] = useState(connection.weight || 1);
  const [isActive, setIsActive] = useState(connection.isActive ?? true);
  const [customModels, setCustomModels] = useState<string[]>(() => parseInitialModels(connection.customModels));
  const [newCustomModelInput, setNewCustomModelInput] = useState("");
  const [disallowedModels, setDisallowedModels] = useState<string[]>(() => parseInitialModels(connection.disallowedModels));
  const [newDisallowedModelInput, setNewDisallowedModelInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  function addCustomModel() {
    const trimmed = newCustomModelInput.trim();
    if (!trimmed) return;
    if (!customModels.includes(trimmed)) {
      setCustomModels([...customModels, trimmed]);
    }
    setNewCustomModelInput("");
  }

  function removeCustomModel(model: string) {
    setCustomModels(customModels.filter((m) => m !== model));
  }

  function addDisallowedModel() {
    const trimmed = newDisallowedModelInput.trim();
    if (!trimmed) return;
    if (!disallowedModels.includes(trimmed)) {
      setDisallowedModels([...disallowedModels, trimmed]);
    }
    setNewDisallowedModelInput("");
  }

  function removeDisallowedModel(model: string) {
    setDisallowedModels(disallowedModels.filter((m) => m !== model));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const payload: Record<string, any> = {
        name: name.trim(),
        accountEmail: accountEmail.trim() || null,
        priority: Number(priority),
        weight: Number(weight),
        isActive,
        customModels,
        disallowedModels,
      };

      if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }

      if (baseUrl.trim()) {
        payload.baseUrl = baseUrl.trim();
      }

      const res = await fetch(`/api/admin/providers/${connection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success) {
        onSuccess(`Connection "${name}" updated successfully!`);
        onClose();
      } else {
        setErrorMsg(json.error || "Failed to update connection.");
      }
    } catch {
      setErrorMsg("Network error while updating connection.");
    }
    setIsSubmitting(false);
  }

  return (
    <div
      className="modal-overlay"
      style={{ overflowY: "auto", padding: "16px" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card"
        style={{
          width: "540px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          margin: "auto",
        }}
      >
        <div className="modal-header shrink-0">
          <div className="modal-title-wrap">
            <Edit size={15} className="text-blue shrink-0" />
            <h3 className="modal-title-text">Edit Akun: {connection.name}</h3>
          </div>
          <button className="btn-close" type="button" onClick={onClose} title="Tutup">
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="login-error text-xs p-2.5 mx-4 mt-3 rounded bg-[var(--red-soft)] border border-[var(--red-border)] text-[var(--red)] shrink-0">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ overscrollBehavior: "contain" }}>
            <div className="form-group mb-3">
              <label className="text-xs font-semibold mb-1 block">Nama Akun / Label *</label>
              <input
                type="text"
                className="control w-full text-xs"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group mb-3">
              <label className="text-xs font-semibold mb-1 block">Account Email</label>
              <input
                type="email"
                className="control w-full text-xs"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>

            {connection.authType !== "OAUTH" && (
              <div className="form-group mb-3">
                <label className="text-xs font-semibold mb-1 block">
                  Update API Key (Kosongkan jika tidak berubah)
                </label>
                <input
                  type="password"
                  className="control w-full text-xs mono"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={connection.maskedApiKey || "sk-..."}
                />
              </div>
            )}

            {connection.baseUrl && (
              <div className="form-group mb-3">
                <label className="text-xs font-semibold mb-1 block">Base URL Upstream</label>
                <input
                  type="url"
                  className="control w-full text-xs mono"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="form-group">
                <label className="text-xs font-semibold mb-1 block">Prioritas</label>
                <input
                  type="number"
                  className="control w-full text-xs"
                  value={priority}
                  min="1"
                  max="100"
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label className="text-xs font-semibold mb-1 block">Bobot Round-Robin</label>
                <input
                  type="number"
                  className="control w-full text-xs"
                  value={weight}
                  min="1"
                  max="100"
                  onChange={(e) => setWeight(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Model Routing Rules (Whitelist & Blacklist) */}
            <div className="border border-[var(--border)] rounded-md p-3 mb-3 bg-[var(--surface-subtle,#18181b)]">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Layers size={13} className="text-blue shrink-0" />
                <span className="text-xs font-semibold">Aturan Model Akun (Whitelist & Blacklist)</span>
              </div>

              {/* Whitelist: Model Khusus / Eksklusif */}
              <div className="mb-3.5">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-emerald-400 block">
                    Model Khusus / Eksklusif (Whitelist)
                  </label>
                  {customModels.length > 0 && (
                    <span className="text-[10px] text-emerald-400/80 font-mono">
                      {customModels.length} model
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[var(--muted,#71717a)] mb-1.5 leading-relaxed">
                  Hanya akun ini (dan akun lain yang mendaftarkannya) yang akan menerima request model tersebut. Jika kosong, aturan dilewati (menerima semua model umum).
                </p>
                <div className="flex gap-1.5 mb-1.5">
                  <input
                    type="text"
                    className="control w-full text-xs mono"
                    placeholder="e.g. claude-opus-5-5-high, gemini-3.8-flash-high"
                    value={newCustomModelInput}
                    onChange={(e) => setNewCustomModelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomModel();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="control text-xs px-2.5 shrink-0 bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/50"
                    onClick={addCustomModel}
                  >
                    + Tambah
                  </button>
                </div>
                {customModels.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 max-h-36 overflow-y-auto p-1.5 rounded bg-[var(--bg,#0c0c0e)] border border-emerald-950/60">
                    {customModels.map((m) => (
                      <span
                        key={m}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950/60 border border-emerald-800 text-emerald-300"
                      >
                        {m}
                        <button
                          type="button"
                          className="hover:text-white transition-colors"
                          onClick={() => removeCustomModel(m)}
                          title="Hapus"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Blacklist: Model Diblokir */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-rose-400 block">
                    Model Diblokir (Blacklist)
                  </label>
                  {disallowedModels.length > 0 && (
                    <span className="text-[10px] text-rose-400/80 font-mono">
                      {disallowedModels.length} model
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[var(--muted,#71717a)] mb-1.5 leading-relaxed">
                  Akun ini TIDAK AKAN PERNAH dipilih untuk model di bawah ini, baik sebagai koneksi utama maupun cadangan failover.
                </p>
                <div className="flex gap-1.5 mb-1.5">
                  <input
                    type="text"
                    className="control w-full text-xs mono"
                    placeholder="e.g. claude-sonnet-4-6"
                    value={newDisallowedModelInput}
                    onChange={(e) => setNewDisallowedModelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addDisallowedModel();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="control text-xs px-2.5 shrink-0 bg-rose-950/40 border-rose-800/60 text-rose-300 hover:bg-rose-900/50"
                    onClick={addDisallowedModel}
                  >
                    + Blokir
                  </button>
                </div>
                {disallowedModels.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 max-h-36 overflow-y-auto p-1.5 rounded bg-[var(--bg,#0c0c0e)] border border-rose-950/60">
                    {disallowedModels.map((m) => (
                      <span
                        key={m}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-rose-950/60 border border-rose-800 text-rose-300"
                      >
                        {m}
                        <button
                          type="button"
                          className="hover:text-white transition-colors"
                          onClick={() => removeDisallowedModel(m)}
                          title="Hapus"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group mb-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span className="font-semibold">Akun Aktif (Menerima Trafik Proxy)</span>
              </label>
            </div>
          </div>

          <div className="modal-actions flex justify-end gap-2 p-3 border-t border-[var(--border)] bg-[var(--surface-subtle,#18181b)] shrink-0">
            <button
              type="button"
              className="control text-xs"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Batal
            </button>
            <button
              type="submit"
              className="primary btn-inline text-xs"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
