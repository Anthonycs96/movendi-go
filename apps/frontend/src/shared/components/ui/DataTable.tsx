"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "./FeedbackState";

export interface DataColumn<T> {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "center" | "right";
  sortValue?: (row: T) => string | number | Date | null | undefined;
  sortable?: boolean;
  cell: (row: T) => ReactNode;
}

const ExternalRowsContext = createContext<readonly unknown[] | null>(null);
const rowCollator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export function ExternalDataTableRows({ rows, children }: { rows: readonly unknown[] | null; children: ReactNode }) {
  return <ExternalRowsContext.Provider value={rows}>{children}</ExternalRowsContext.Provider>;
}

export function DataTable<T>({ rows, columns, rowKey, emptyTitle = "Sin resultados", pageSize = 10, paginationMode = "client" }: { rows: T[]; columns: DataColumn<T>[]; rowKey: (row: T) => string; emptyTitle?: string; pageSize?: number; paginationMode?: "client" | "external" }) {
  const externalRows = useContext(ExternalRowsContext);
  const isExternal = paginationMode === "external" || rows === externalRows;
  const [pagination, setPagination] = useState({ rowSignature: "", page: 1 });
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const rowSignature = rows.map(rowKey).join("\u0000");
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const requestedPage = pagination.rowSignature === rowSignature ? pagination.page : 1;
  const currentPage = Math.min(requestedPage, pages);
  const sortableColumns = useMemo(() => new Set(columns.filter((column) => {
    if (column.sortable === false) return false;
    if (column.sortValue || column.sortable) return true;
    return rows.some((row) => {
      const value = (row as Record<string, unknown>)[column.key];
      return typeof value === "string" || typeof value === "number" || value instanceof Date;
    });
  }).map((column) => column.key)), [columns, rows]);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return rows;
    const valueFor = (row: T) => column.sortValue ? column.sortValue(row) : (row as Record<string, unknown>)[column.key] as string | number | Date | null | undefined;
    return [...rows].sort((left, right) => {
      const a = valueFor(left);
      const b = valueFor(right);
      if (a == null) return b == null ? 0 : 1;
      if (b == null) return -1;
      const comparison = typeof a === "number" && typeof b === "number"
        ? a - b
        : rowCollator.compare(String(a instanceof Date ? a.toISOString() : a), String(b instanceof Date ? b.toISOString() : b));
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [columns, rows, sort]);
  const visibleRows = useMemo(() => isExternal ? sortedRows : sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize), [currentPage, isExternal, pageSize, sortedRows]);

  function toggleSort(key: string) {
    setPagination({ rowSignature, page: 1 });
    setSort((current) => current?.key === key
      ? current.direction === "asc" ? { key, direction: "desc" } : null
      : { key, direction: "asc" });
  }

  return (
    <div className="data-table">
      <div className="data-table__scroll" tabIndex={0} role="region" aria-label="Tabla desplazable">
        <table>
          <thead><tr>{columns.map((column) => {
            const sortable = sortableColumns.has(column.key);
            const activeSort = sort?.key === column.key ? sort.direction : null;
            return <th key={column.key} style={{ width: column.width, textAlign: column.align }} aria-sort={activeSort === "asc" ? "ascending" : activeSort === "desc" ? "descending" : undefined}>{sortable ? <button type="button" className="table-sort" onClick={() => toggleSort(column.key)} aria-label={`Ordenar por ${column.header}`}>{column.header}{activeSort === "asc" ? <ArrowUp size={12} /> : activeSort === "desc" ? <ArrowDown size={12} /> : <ChevronsUpDown size={12} />}</button> : column.header}</th>;
          })}</tr></thead>
          <tbody>
            {visibleRows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key} style={{ textAlign: column.align }}>{column.cell(row)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      {!rows.length ? <EmptyState title={emptyTitle} description="Prueba con otros filtros o crea el primer registro." /> : null}
      {rows.length && !isExternal ? <div className="pagination"><span>Mostrando {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, rows.length)} de {rows.length}</span><div><button type="button" disabled={currentPage === 1} onClick={() => setPagination({ rowSignature, page: Math.max(1, currentPage - 1) })} aria-label="Página anterior"><ChevronLeft size={15} /></button><b>{currentPage} / {pages}</b><button type="button" disabled={currentPage === pages} onClick={() => setPagination({ rowSignature, page: Math.min(pages, currentPage + 1) })} aria-label="Página siguiente"><ChevronRight size={15} /></button></div></div> : null}
    </div>
  );
}
