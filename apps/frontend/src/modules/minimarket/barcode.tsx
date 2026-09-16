"use client";
import { useState } from "react";
import type { MinimarketProduct } from "@movendi/contracts";
import { BarcodeScanner } from "@/shared/barcode/BarcodeScanner";

export type BarcodeMatch = {
  product: MinimarketProduct; presentationId: string; branch: { id: string; name: string };
  movements: Array<{ id: string; type: string; quantity: number; direction: string; stockBefore: number; stockAfter: number; createdAt: string; reference: string | null; originId: string | null; actor: { name: string } | null }>;
};
class BarcodeLookupError extends Error { constructor(message: string, public readonly status: number) { super(message); } }
export async function findBarcode(code: string, section: string): Promise<BarcodeMatch> {
  const response = await fetch(`/api/minimarket/lookup?${new URLSearchParams({ code, section })}`, { cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw new BarcodeLookupError(value.error?.message ?? "No se pudo consultar el producto.", response.status);
  return value as BarcodeMatch;
}
export function BarcodeField({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial), [open, setOpen] = useState(false);
  return <div><label>Código de barras<input name="barcode" value={value} maxLength={80} onChange={(event) => setValue(event.target.value)} /></label><button type="button" onClick={() => setOpen(!open)}>{open ? "Cerrar lector" : "Leer código con cámara"}</button>{open ? <BarcodeScanner onScan={async (code) => { setValue(code); return "Código copiado al producto. Completa los datos y guarda."; }} /> : null}</div>;
}
export function ProductLookup({ section, currency, onProduct, canCreate = false }: { section: string; currency: string; onProduct?: (product: MinimarketProduct, presentationId: string) => void; canCreate?: boolean }) {
  const [match, setMatch] = useState<BarcodeMatch | null>(null), [missing, setMissing] = useState("");
  const presentation = match?.product.presentations.find((p) => p.id === match.presentationId);
  return <section aria-label="Consulta rápida de producto"><h2>Consultar producto</h2><BarcodeScanner onScan={async (code) => {
    setMissing("");
    try { const found = await findBarcode(code, section); setMatch(found); onProduct?.(found.product, found.presentationId); return `${found.product.name} · ${found.product.presentations.find((p) => p.id === found.presentationId)?.name}`; }
    catch (cause) { setMatch(null); if (cause instanceof BarcodeLookupError && cause.status === 404) setMissing(code); throw cause; }
  }} />{missing && canCreate ? <a href={`catalog?barcode=${encodeURIComponent(missing)}`}>Registrar producto con este código</a> : null}
    {match && presentation ? <article><h3>{match.product.name}</h3><p>{match.branch.name} · {match.product.category} · {presentation.name}</p><p>Precio: {new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(presentation.priceCents / 100)}</p><p>Stock: {match.product.stock} {match.product.unit} · Mínimo: {match.product.minimumStock} · Presentación: {presentation.factor} {match.product.unit}</p>{!match.product.active || !presentation.active ? <p>Producto o presentación inactivos</p> : null}{match.product.lots.map((lot) => <p key={lot.id}>Lote {lot.code}: {lot.stock} {match.product.unit} · Vence {lot.expiresOn}</p>)}{match.movements.length ? <details><summary>Kardex: últimos movimientos</summary>{match.movements.map((m) => <p key={m.id}>{new Date(m.createdAt).toLocaleString("es-PE")} · {m.type} · {m.stockBefore} → {m.stockAfter} · {m.actor?.name ?? "Sistema"} · {m.reference ?? m.originId}</p>)}</details> : null}</article> : null}
  </section>;
}
