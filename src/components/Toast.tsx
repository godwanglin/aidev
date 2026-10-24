"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  title?: string;
  duration?: number;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

class ToastManager {
  private toasts: ToastItem[] = [];
  private listeners: Set<ToastListener> = new Set();

  private notify() {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  subscribe(listener: ToastListener) {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  show(type: ToastType, message: string, options?: ToastOptions) {
    if (!message) return;
    const id = Math.random().toString(36).substring(2, 9);
    const defaultTitle =
      type === "success"
        ? "Success!"
        : type === "error"
        ? "Error"
        : type === "warning"
        ? "Warning"
        : "Info";

    const item: ToastItem = {
      id,
      type,
      title: options?.title || defaultTitle,
      message,
      duration: options?.duration ?? (type === "error" ? 4500 : 3500),
    };

    // Keep max 4 toasts at a time
    this.toasts = [item, ...this.toasts.slice(0, 3)];
    this.notify();
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  clear() {
    this.toasts = [];
    this.notify();
  }

  success(message: string, options?: ToastOptions) {
    this.show("success", message, options);
  }

  error(message: string, options?: ToastOptions) {
    this.show("error", message, options);
  }

  warning(message: string, options?: ToastOptions) {
    this.show("warning", message, options);
  }

  info(message: string, options?: ToastOptions) {
    this.show("info", message, options);
  }
}

export const toast = new ToastManager();

function SingleToast({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const startTimeRef = useRef<number>(Date.now());
  const remainingTimeRef = useRef<number>(item.duration);

  useEffect(() => {
    if (item.duration <= 0) return;

    let timer: NodeJS.Timeout;
    const step = 25; // ms
    const interval = setInterval(() => {
      if (isPaused) {
        startTimeRef.current = Date.now();
        return;
      }

      const elapsed = Date.now() - startTimeRef.current;
      startTimeRef.current = Date.now();
      remainingTimeRef.current -= elapsed;

      const pct = Math.max(0, (remainingTimeRef.current / item.duration) * 100);
      setProgress(pct);

      if (remainingTimeRef.current <= 0) {
        clearInterval(interval);
        onDismiss(item.id);
      }
    }, step);

    return () => clearInterval(interval);
  }, [item.id, item.duration, isPaused, onDismiss]);

  const config = {
    success: {
      border: "border-emerald-500/30",
      glow: "shadow-emerald-950/40",
      accentBg: "bg-emerald-500/15",
      accentText: "text-emerald-400",
      titleColor: "text-emerald-400",
      progressBar: "bg-emerald-500",
      icon: CheckCircle2,
    },
    error: {
      border: "border-red-500/30",
      glow: "shadow-red-950/40",
      accentBg: "bg-red-500/15",
      accentText: "text-red-400",
      titleColor: "text-red-400",
      progressBar: "bg-red-500",
      icon: AlertCircle,
    },
    warning: {
      border: "border-amber-500/30",
      glow: "shadow-amber-950/40",
      accentBg: "bg-amber-500/15",
      accentText: "text-amber-400",
      titleColor: "text-amber-400",
      progressBar: "bg-amber-500",
      icon: AlertTriangle,
    },
    info: {
      border: "border-sky-500/30",
      glow: "shadow-sky-950/40",
      accentBg: "bg-sky-500/15",
      accentText: "text-sky-400",
      titleColor: "text-sky-400",
      progressBar: "bg-sky-500",
      icon: Info,
    },
  }[item.type];

  const Icon = config.icon;

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`group relative overflow-hidden rounded-2xl bg-[#131720]/95 backdrop-blur-xl border ${config.border} p-3.5 shadow-2xl ${config.glow} transition-all duration-300 toast-animate-in hover:border-white/20`}
      style={{
        minWidth: "280px",
        maxWidth: "420px",
      }}
    >
      <div className="flex items-start gap-3">
        {/* Glowing Status Icon */}
        <div
          className={`w-8 h-8 rounded-xl ${config.accentBg} ${config.accentText} border border-white/5 flex items-center justify-center shrink-0 mt-0.5 shadow-sm`}
        >
          <Icon size={16} strokeWidth={2.2} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-1">
          {item.title && (
            <div className={`text-xs font-semibold ${config.titleColor} tracking-wide mb-0.5`}>
              {item.title}
            </div>
          )}
          <div className="text-xs text-gray-200 leading-snug break-words font-medium">
            {item.message}
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={() => onDismiss(item.id)}
          className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0 -mr-1 -mt-1"
          aria-label="Dismiss toast"
        >
          <X size={14} />
        </button>
      </div>

      {/* Progress Bar (countdown indicator) */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5 overflow-hidden">
        <div
          className={`h-full ${config.progressBar} transition-all duration-75 opacity-70`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return toast.subscribe(setToasts);
  }, []);

  const handleDismiss = useCallback((id: string) => {
    toast.dismiss(id);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 sm:top-5 sm:right-5 z-[99999] flex flex-col gap-2.5 pointer-events-auto"
      style={{
        maxWidth: "calc(100vw - 2rem)",
      }}
    >
      {toasts.map((item) => (
        <SingleToast key={item.id} item={item} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}

export function useToast() {
  return toast;
}
