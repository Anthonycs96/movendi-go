"use client";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MinimarketData } from "@movendi/contracts";
import styles from "./MinimarketWorkspace.module.css";

export function RetailSearch({ data }: { data: MinimarketData }) {
  const router = useRouter(), path = usePathname(), current = useSearchParams();
  function navigate(page: number, q = current.get("q") ?? "") { const params = new URLSearchParams(current); params.set("q", q); params.set("page", String(page)); router.push(`${path}?${params}`); }
  return <div className={styles.searchToolbar}><form className={styles.searchBox} onSubmit={(event) => { event.preventDefault(); navigate(1, String(new FormData(event.currentTarget).get("q") ?? "")); }}><Search size={19} aria-hidden="true" /><input aria-label="Buscar productos, código o cliente" name="q" key={current.get("q")} defaultValue={current.get("q") ?? ""} placeholder="Buscar por nombre o código" /><button type="submit">Buscar</button></form>{data.pages > 1 ? <nav className={styles.pagination} aria-label="Páginas de resultados"><button type="button" aria-label="Página anterior" disabled={data.page <= 1} onClick={() => navigate(data.page - 1)}><ChevronLeft size={18} /></button><span>{data.page} de {data.pages}</span><button type="button" aria-label="Página siguiente" disabled={data.page >= data.pages} onClick={() => navigate(data.page + 1)}><ChevronRight size={18} /></button></nav> : null}</div>;
}
