"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { localRead, localUpdate } from "./local-store";
export type CartLine = { presentationId: string; name: string; priceCents: number; weighted: boolean; quantity: number };
type SavedCart = { intentId: string; lines: CartLine[]; cursors?: Record<string, number> };
const empty = (): SavedCart => ({ intentId: crypto.randomUUID(), lines: [], cursors: {} });
export function useCart(scope: string) {
  const [saved, setSaved] = useState<SavedCart>({ intentId: "", lines: [] }), [ready, setReady] = useState(false), [error, setError] = useState("");
  const mounted = useRef(false);
  const refresh = useCallback(async () => { const next = await localRead<SavedCart>("cart:" + scope); if (next && mounted.current) setSaved(next); }, [scope]);
  useEffect(() => {
    mounted.current = true;
    void localUpdate<SavedCart>("cart:" + scope, (value) => value ?? empty()).then((value) => { if (mounted.current) { setSaved(value); setReady(true); } }).catch(() => setError("No se pudo recuperar el carrito. Habilita el almacenamiento de este navegador para operar."));
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("movendi-retail") : null;
    if (channel) channel.onmessage = (event) => { if (event.data?.cartScope === scope) void refresh().catch(() => setError("No se pudo actualizar el carrito.")); };
    return () => { mounted.current = false; channel?.close(); };
  }, [scope, refresh]);
  async function update(transform: (value: SavedCart) => SavedCart) {
    try {
      const next = await localUpdate<SavedCart>("cart:" + scope, (value) => transform(value ?? empty()));
      if (mounted.current) setSaved(next);
      const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("movendi-retail") : null;
      channel?.postMessage({ type: "cart-updated", cartScope: scope }); channel?.close();
      return next;
    } catch { setError("No se pudo guardar el carrito en este dispositivo."); throw new Error("No se pudo guardar la lectura en este dispositivo."); }
  }
  const setCart = (change: CartLine[] | ((lines: CartLine[]) => CartLine[])) => update((value) => ({ ...value, lines: typeof change === "function" ? change(value.lines) : change })).then(() => true, () => false);
  async function receiveScan(connectionId: string, sequence: number, intentId: string, line: CartLine) {
    let accepted = true;
    await update((value) => {
      if (sequence <= (value.cursors?.[connectionId] ?? 0)) return value;
      if (intentId !== value.intentId) { accepted = false; return value; }
      const lines = value.lines.some((row) => row.presentationId === line.presentationId) ? value.lines.map((row) => row.presentationId === line.presentationId ? { ...row, quantity: row.quantity + 1 } : row) : [...value.lines, line];
      return { ...value, lines, cursors: { [connectionId]: sequence } };
    });
    return accepted;
  }
  async function scanStatus(connectionId: string, sequence: number, intentId: string) {
    const current = await localRead<SavedCart>("cart:" + scope);
    return sequence <= (current?.cursors?.[connectionId] ?? 0) ? "ADDED" : current?.intentId === intentId ? "PENDING" : "REJECTED";
  }
  return { cart: saved.lines, intentId: saved.intentId, setCart, receiveScan, scanStatus, refresh, ready, error };
}
