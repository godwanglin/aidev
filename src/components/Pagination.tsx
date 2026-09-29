"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";

export interface PaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newPageSize: number) => void;
  pageSizeOptions?: number[];
  itemName?: string;
  disabled?: boolean;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50],
  itemName = "items",
  disabled = false,
  className = "",
}: PaginationProps) {
  const safeTotalPages = Math.max(totalPages, 1);
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  const hasPrev = page > 1 && !disabled;
  const hasNext = page < safeTotalPages && !disabled;

  return (
    <div className={`table-footer ${className}`.trim()}>
      <div className="table-footer-left">
        <span className="table-footer-text">
          Showing {from} to {to} of {totalCount.toLocaleString()} {itemName}
        </span>

        {onPageSizeChange && pageSizeOptions.length > 0 && (
          <div className="per-page-wrap flex items-center gap-2">
            <span className="text-muted text-xs">Per page:</span>
            <CustomDropdown
              size="sm"
              value={String(pageSize)}
              onChange={(val: string) => onPageSizeChange(Number(val))}
              options={pageSizeOptions.map((opt) => ({
                value: String(opt),
                label: String(opt),
              }))}
              minWidth={68}
              width={68}
              align="left"
            />
          </div>
        )}
      </div>

      <div className="pager">
        <button
          type="button"
          className="pager-btn"
          disabled={!hasPrev}
          onClick={() => onPageChange(page - 1)}
          title="Previous Page"
        >
          <ChevronLeft size={11} />
          <span>Prev</span>
        </button>

        <span className="pager-info">
          {page}/{safeTotalPages}
        </span>

        <button
          type="button"
          className="pager-btn"
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
          title="Next Page"
        >
          <span>Next</span>
          <ChevronRight size={11} />
        </button>
      </div>
    </div>
  );
}
