"use client";

import React, { useState } from "react";
import { X, Download, Copy, Check, FileJson, RefreshCw, AlertCircle } from "lucide-react";

interface ExportCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerName: string;
  providerSlug: string;
  exportData: any | null;
  loading: boolean;
  error: string | null;
  onDownloadFile?: () => void;
}

export default function ExportCredentialsModal({
  isOpen,
  onClose,
  providerName,
  providerSlug,
  exportData,
  loading,
  error,
  onDownloadFile,
}: ExportCredentialsModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const jsonString = exportData ? JSON.stringify(exportData, null, 2) : "";

  const handleCopy = async () => {
    if (!jsonString) return;
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownload = () => {
    if (onDownloadFile) {
      onDownloadFile();
      return;
    }
    if (!jsonString) return;
    const blob = new Blob([jsonString], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeSlug = (providerSlug || "provider").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    link.download = `aidev-${safeSlug}-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="export-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="export-modal-card">
        {/* Header */}
        <div className="export-modal-header">
          <div className="export-modal-header-left">
            <div className="export-modal-icon-badge">
              <FileJson size={18} />
            </div>
            <div>
              <h3 className="export-modal-title">Export Credentials (JSON)</h3>
              <p className="export-modal-subtitle">
                {providerName} &bull; {exportData?.count ?? 0} account{exportData?.count === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="export-modal-close-btn"
            aria-label="Close export modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="export-modal-body">
          {loading ? (
            <div className="export-modal-loading">
              <RefreshCw size={20} className="animate-spin" />
              <span>Decrypting and generating JSON export...</span>
            </div>
          ) : error ? (
            <div className="export-modal-error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          ) : (
            <div className="export-modal-content">
              <div className="export-modal-alert">
                <span className="export-alert-dot" />
                <span>
                  File JSON ini berisi kredensial (API Key / OAuth Access & Refresh Token) asli yang sudah didekripsi. Simpan di tempat yang aman.
                </span>
              </div>

              {/* JSON Code Viewer */}
              <div className="export-json-container">
                <div className="export-json-top-bar">
                  <span className="export-json-label">json payload</span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="export-json-copy-btn"
                    title="Salin JSON ke clipboard"
                  >
                    {copied ? (
                      <>
                        <Check size={13} className="text-emerald" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="export-json-code">
                  <code>{jsonString}</code>
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="export-modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="export-btn-secondary"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={loading || !!error || !exportData}
            className="export-btn-primary"
          >
            <Download size={14} />
            <span>Download .json</span>
          </button>
        </div>
      </div>
    </div>
  );
}
