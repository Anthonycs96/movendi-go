"use client";
import { useCallback, useEffect, useState } from "react";
import { localRead, localWrite } from "./local-store";
export type CartLine = { presentationId: string; name: string; priceCents: number; weighted: boolean; quantity: number };
type SavedCart = { intentId: string; lines: CartLine[] };
export function useCart(scope: string) {
  const [cart, setCart] = useState<CartLine[]>([]), [intentId, setIntentId] = useState(""), [ready, setReady] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    void localRead<SavedCart>("cart:" + scope).then((saved) => { if (mounted) { setCart(saved?.lines ?? []); setIntentId(saved?.intentId ?? crypto.randomUUID()); setReady(true); } }).catch(() => { if (mounted) setError("No se pudo recuperar el carrito. Habilita el almacenamiento de este navegador para operar."); });
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("movendi-retail") : null;
    if (channel) channel.onmessage = (event) => { if (event.data?.scope === scope && event.data?.type === "sale-complete") { setCart([]); setIntentId(crypto.randomUUID()); } };
    return () => { mounted = false; channel?.close(); };
  }, [scope]);
  useEffect(() => { if (ready) void localWrite("cart:" + scope, { intentId, lines: cart }).catch(() => setError("No se pudo guardar el carrito en este dispositivo.")); }, [cart, ready, scope, intentId]);
  const clearCart = useCallback(() => { setCart([]); setIntentId(crypto.randomUUID()); }, []);
  return { cart, setCart, intentId, clearCart, ready, error };
}
