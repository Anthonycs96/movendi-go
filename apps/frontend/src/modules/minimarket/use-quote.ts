"use client";
import { useEffect, useState } from "react";
type Quote = { totalCents: number; discountCents: number; lines: Array<{ presentationId: string; totalCents: number; discountCents: number; promotionName: string | null }> };
export function useQuote(lines: Array<{ presentationId: string; quantity: number }>, refreshKey = "") {
  const signature = JSON.stringify(lines.map(({ presentationId, quantity }) => ({ presentationId, quantity })));
  const [result, setResult] = useState<{ signature: string; refreshKey: string; quote?: Quote; error?: string } | null>(null);
  useEffect(() => {
    if (signature === "[]") return;
    const controller = new AbortController();
    const timer = setTimeout(() => { void fetch("/api/minimarket/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: `{"lines":${signature}}`, signal: controller.signal }).then(async (response) => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? "No se pudo verificar el precio."); setResult({ signature, refreshKey, quote: data });
    }).catch((e: unknown) => { if (!controller.signal.aborted) setResult({ signature, refreshKey, error: e instanceof Error ? e.message : "Sin conexión para verificar el precio." }); }); }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [signature, refreshKey]);
  return { quote: (result?.signature === signature && result.refreshKey === refreshKey) ? result.quote : undefined, error: (result?.signature === signature && result.refreshKey === refreshKey) ? result.error : undefined, ready: signature === "[]" || ((result?.signature === signature && result.refreshKey === refreshKey) && !!result.quote) };
}
