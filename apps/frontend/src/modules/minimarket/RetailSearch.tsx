"use client";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MinimarketData } from "@movendi/contracts";
import styles from "./MinimarketWorkspace.module.css";

export function RetailSearch({ data }: { data: MinimarketData }) {
  const router = useRouter(), path = usePathname(), current = useSearchParams();
  const section = path.split("/").at(-1);
  const productFilters = ["catalog", "inventory", "purchases", "pos"].includes(section ?? "");
  function filter(name: string, value: string) {
    const params = new URLSearchParams(current);
    if (value) params.set(name, value); else params.delete(name);
    params.set("page", "1");
    router.push(`${path}?${params}`);
  }
  function navigate(page: number, q = current.get("q") ?? "") { const params = new URLSearchParams(current); params.set("q", q); params.set("page", String(page)); router.push(`${path}?${params}`); }
  return <div className={styles.searchToolbar}>
    <form className={styles.searchBox} onSubmit={(event) => { event.preventDefault(); navigate(1, String(new FormData(event.currentTarget).get("q") ?? "")); }}><Search size={19} aria-hidden="true" /><input aria-label="Buscar productos, código o cliente" name="q" key={current.get("q")} defaultValue={current.get("q") ?? ""} placeholder={productFilters ? "Nombre, código o categoría" : "Buscar por nombre o código"} /><button type="submit">Buscar</button></form>
    {productFilters ? <div className={styles.catalogFilters}>
      <label>Filtrar por categoría<select value={current.get("category") ?? ""} onChange={(event) => filter("category", event.target.value)}><option value="">Todas las categorías</option>{data.categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label>
      {section !== "pos" ? <label>Estado del producto<select value={current.get("status") ?? ""} onChange={(event) => filter("status", event.target.value)}><option value="">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label> : null}
      <span className={styles.muted}>{data.totalRows} {data.totalRows === 1 ? "producto" : "productos"}</span>
      {current.get("q") || current.get("category") || current.get("status") ? <button type="button" onClick={() => { const params = new URLSearchParams(current); ["q", "category", "status", "page"].forEach((name) => params.delete(name)); router.push(`${path}?${params}`); }}>Limpiar filtros</button> : null}
    </div> : null}
    {data.pages > 1 ? <nav className={styles.pagination} aria-label="Páginas de resultados"><button type="button" aria-label="Página anterior" disabled={data.page <= 1} onClick={() => navigate(data.page - 1)}><ChevronLeft size={18} /></button><span>{data.page} de {data.pages}</span><button type="button" aria-label="Página siguiente" disabled={data.page >= data.pages} onClick={() => navigate(data.page + 1)}><ChevronRight size={18} /></button></nav> : null}
  </div>;
}
