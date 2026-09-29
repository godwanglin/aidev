"use client";

import React from "react";
import { Pagination, PaginationProps } from "./Pagination";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  width?: string | number;
  align?: "left" | "center" | "right";
  className?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T = any> {
  columns?: Column<T>[];
  data?: T[];
  keyExtractor?: (row: T, index: number) => string | number;
  renderRow?: (row: T, index: number) => React.ReactNode;
  loading?: boolean;
  loadingMessage?: React.ReactNode;
  emptyMessage?: React.ReactNode;
  pagination?: PaginationProps;
  children?: React.ReactNode;
  wrapClassName?: string;
  className?: string;
  tableClassName?: string;
}

export function DataTable<T = any>({
  columns,
  data,
  keyExtractor,
  renderRow,
  loading = false,
  loadingMessage = "Memuat data...",
  emptyMessage = "Tidak ada data yang tersedia.",
  pagination,
  children,
  wrapClassName = "logs-wrap",
  className = "panel logs",
  tableClassName = "table",
}: DataTableProps<T>) {
  const colSpan = columns?.length || 1;

  return (
    <article className={className}>
      <div className={wrapClassName}>
        <table className={tableClassName}>
          {columns && (
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    className={[
                      col.align === "right" ? "text-right" : "",
                      col.align === "center" ? "text-center" : "",
                      col.className || "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
          )}

          {children ? (
            children
          ) : (
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colSpan} className="text-center py-4 text-muted">
                    {loadingMessage}
                  </td>
                </tr>
              ) : !data || data.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="text-center py-4 text-muted">
                    {emptyMessage}
                  </td>
                </tr>
              ) : renderRow ? (
                data.map((row, idx) => (
                  <React.Fragment
                    key={keyExtractor ? keyExtractor(row, idx) : (row as any)?.id || idx}
                  >
                    {renderRow(row, idx)}
                  </React.Fragment>
                ))
              ) : (
                data.map((row, idx) => (
                  <tr key={keyExtractor ? keyExtractor(row, idx) : (row as any)?.id || idx}>
                    {columns?.map((col) => {
                      const val = (row as any)[col.key];
                      const rendered = col.render ? col.render(row, idx) : val;
                      return (
                        <td
                          key={col.key}
                          className={[
                            col.align === "right" ? "text-right" : "",
                            col.align === "center" ? "text-center" : "",
                            col.className || "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {rendered ?? "-"}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          )}
        </table>
      </div>

      {pagination && <Pagination {...pagination} />}
    </article>
  );
}
