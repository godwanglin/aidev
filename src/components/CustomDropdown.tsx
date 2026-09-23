"use client";

import { useState, useRef, useEffect, ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  icon?: ReactNode;
  sublabel?: string;
}

interface CustomDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  icon?: ReactNode;
  size?: "sm" | "md";
  minWidth?: string | number;
  width?: string | number;
  className?: string;
  title?: string;
  align?: "left" | "right";
  direction?: "down" | "up" | "auto";
  disabled?: boolean;
}

export default function CustomDropdown({
  value,
  onChange,
  options,
  placeholder = "Pilih...",
  icon,
  size = "sm",
  minWidth,
  width,
  className = "",
  title,
  align = "left",
  direction = "auto",
  disabled = false,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div
      className={`custom-dropdown-container ${isOpen ? "is-open" : ""} ${className}`}
      ref={containerRef}
      style={{ width: width || "auto", minWidth }}
    >
      <button
        type="button"
        disabled={disabled}
        className={`custom-dropdown-trigger ${size} ${isOpen ? "active" : ""}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) {
            if (!isOpen && containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              if (direction === "up" || (direction === "auto" && spaceBelow < 230)) {
                setOpenUpwards(true);
              } else {
                setOpenUpwards(false);
              }
            }
            setIsOpen((prev) => !prev);
          }
        }}
        title={title}
        style={{ width: width ? "100%" : "auto", minWidth }}
      >
        {selectedOption?.icon || icon ? (
          <span className="shrink-0 flex items-center">{selectedOption?.icon || icon}</span>
        ) : null}
        <span className="trigger-text">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={13} className={`trigger-chevron ${isOpen ? "open" : ""}`} />
      </button>

      {isOpen && (
        <div
          className={`custom-dropdown-popover ${align === "right" ? "align-right" : ""} ${openUpwards ? "direction-up" : ""}`}
          style={{ minWidth: minWidth || "100%" }}
        >
          <div className="custom-dropdown-scroll">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`custom-dropdown-item ${isSelected ? "active" : ""}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                >
                  <div className="item-content">
                    {opt.icon && <span className="shrink-0 flex items-center">{opt.icon}</span>}
                    <div className="flex flex-col text-left">
                      <span className="item-title">{opt.label}</span>
                      {opt.sublabel && (
                        <span className="text-[11px] text-muted">{opt.sublabel}</span>
                      )}
                    </div>
                  </div>
                  {isSelected && <Check size={14} className="item-check" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
