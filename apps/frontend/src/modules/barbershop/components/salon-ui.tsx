"use client";
import { useEffect, useState } from "react";
import type { BarbershopData } from "@movendi/contracts";
export const paymentLabels: Record<string, string> = { CASH: "Efectivo", YAPE: "Yape", PLIN: "Plin", CARD: "Tarjeta", TRANSFER: "Transferencia", OTHER: "Otro", SPLIT: "Combinado", MIXED: "Combinado" };
export const salonCan = (data: BarbershopData, permission: string) => (data.permissions ?? []).some((p) => p === "*" || p === permission || (permission.endsWith(":read") && p === `${permission.slice(0, -5)}:write`));
export async function salonRequest<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "No se pudo completar la operación.");
  return result;
}
export function useSalonResource<T>(url: string, refresh = 0) {
  const [result, setResult] = useState<{ url: string; value: T } | null>(null), [error, setError] = useState("");
  useEffect(() => { let cancelled = false; salonRequest<T>(url).then((value) => { if (!cancelled) { setResult({ url, value }); setError(""); } }).catch((e) => { if (!cancelled) setError(e.message); }); return () => { cancelled = true; }; }, [url, refresh]);
  return { data: result?.url === url ? result.value : null, error };
}
