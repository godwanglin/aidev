"use client";

import React, { useEffect, useCallback } from "react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  maxWidth?: string | number;
  showHeader?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  icon,
  maxWidth = "480px",
  showHeader = true,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  children,
  footer,
  className = "",
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === "Escape") {
        onClose();
      }
    },
    [closeOnEsc, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const widthStyle = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (closeOnOverlayClick) onClose();
      }}
    >
      <div
        className={`modal-card ${className}`.trim()}
        style={{ width: widthStyle, maxWidth: "94vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        {showHeader && (
          <div className="modal-header">
            <div className="modal-title-wrap">
              {icon}
              {typeof title === "string" ? (
                <h3 className="modal-title-text">{title}</h3>
              ) : (
                title
              )}
            </div>
            <button
              className="btn-close"
              type="button"
              onClick={onClose}
              aria-label="Tutup"
            >
              ✕
            </button>
          </div>
        )}

        <div className="modal-content-wrap">{children}</div>

        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}

export function ModalActions({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`modal-actions ${className}`.trim()}>{children}</div>;
}

Modal.Actions = ModalActions;
