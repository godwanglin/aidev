"use client";

import React, { useState } from "react";
import { Edit, X } from "lucide-react";

export interface ConnectionItem {
  id: string;
  provider: string;
  name: string;
  authType?: "API_KEY" | "OAUTH";
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
}

interface EditConnectionModalProps {
  connection: ConnectionItem;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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
    <div className="modal-overlay">
      <div className="modal-card" style={{ width: "490px" }}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <Edit size={15} className="text-blue shrink-0" />
            <h3 className="modal-title-text">Edit Akun: {connection.name}</h3>
          </div>
          <button className="btn-close" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="login-error text-xs p-2.5 mx-4 mt-3 rounded bg-red-950/80 border border-red-800 text-red-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4">
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

          <div className="form-group mb-4">
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span className="font-semibold">Akun Aktif (Menerima Trafik Proxy)</span>
            </label>
          </div>

          <div className="modal-actions flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
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
