"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MinimarketData } from "@movendi/contracts";
import { claimOperation, completeOperation, localRead, type PendingOperation } from "./local-store";
type Result = { id?: string; sku?: string; code?: string; totalCents?: number; changeCents?: number | null; error?: { code?: string; message?: string } };
export const scopeKey = (scope: MinimarketData["scope"]) => [scope.tenantId, scope.branchId, scope.actorId].join(":");
export const cartScopeKey = (data: Pick<MinimarketData, "scope" | "cash">) => `${scopeKey(data.scope)}:cash:${data.cash?.id ?? "draft"}`;
export function useRetailOperation(scope: MinimarketData["scope"]) {
  const router = useRouter(), context = scopeKey(scope);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [online, setOnline] = useState(true), [pending, setPending] = useState<PendingOperation | null>(null), [recoveredSale, setRecoveredSale] = useState<string | null>(null);
  const running = useRef(false);
  useEffect(() => {
    const refresh = () => { setOnline(navigator.onLine); void localRead<PendingOperation>("pending:" + context).then((p) => setPending(p ?? null)).catch(() => setError("El almacenamiento local no está disponible. No es seguro iniciar una operación.")); };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("movendi-retail") : null;
    if (channel) channel.onmessage = (event) => { if (event.data?.scope === context) refresh(); };
    queueMicrotask(refresh); window.addEventListener("online", refresh); window.addEventListener("offline", refresh); window.addEventListener("focus", refresh);
    return () => { channel?.close(); window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); window.removeEventListener("focus", refresh); };
  }, [context]);
  async function run(path: string, body: Record<string, unknown>, method = "POST", recovery?: PendingOperation) {
    if (running.current) return null;
    if (!navigator.onLine) { setError("Sin conexión: conserva los datos y reconecta antes de confirmar. No se ha enviado esta operación."); return null; }
    running.current = true; setBusy(true); setError(""); setMessage("");
    // Credentials and provider probes are never persisted on this device.
    const durable = !["fiscal/credentials", "fiscal/test"].includes(path) && !path.startsWith("fiscal-jobs/");
    let request: PendingOperation | undefined;
    try {
      const signature = JSON.stringify({ path, body, method });
      const proposed = recovery ?? { signature, path, body, method, key: typeof body.idempotencyKey === "string" ? body.idempotencyKey : crypto.randomUUID(), createdAt: new Date().toISOString() };
      if (durable) { request = await claimOperation(context, proposed); setPending(request); }
      else { if (await localRead("pending:" + context)) throw new Error("Resuelve primero la operación pendiente."); request = proposed; }
      const response = await fetch("/api/operations/minimarket/" + path, { method, headers: { "Content-Type": "application/json", "X-Retail-Context": context }, body: JSON.stringify({ ...body, idempotencyKey: request.key }), signal: AbortSignal.timeout(30000) });
      const result = await response.json() as Result;
      if (!response.ok) {
        // Definite validation/transaction rejection is safe to edit. Unknown results and expired sessions keep the original request.
        if (durable && response.status >= 400 && response.status < 500 && ![401, 403, 408, 429].includes(response.status) && !["RETAIL_CONTEXT_CHANGED", "IDEMPOTENCY_CONFLICT"].includes(result.error?.code ?? "")) { await completeOperation(context, request.key, false); setPending(null); }
        throw new Error(result.error?.message ?? "No se pudo guardar la operación.");
      }
      if (durable) { await completeOperation(context, request.key, path === "sales", `${context}:cash:${body.cashSessionId ?? "draft"}`); setPending(null); }
      if (recovery && path === "sales") setRecoveredSale(result.id ?? request.key);
      setMessage(result.code ? "Operación registrada: " + result.code : "Cambios guardados."); router.refresh(); return result;
    } catch (e) { setError(e instanceof Error ? e.message : "Error de conexión. Recupera la operación con la misma clave."); return null; }
    finally { running.current = false; setBusy(false); }
  }
  async function recover() { const saved = await localRead<PendingOperation>("pending:" + context); if (saved) return run(saved.path, saved.body, saved.method, saved); return null; }
  return { run, recover, busy, message, error, online, pending, recoveredSale };
}
export type RetailOperation = ReturnType<typeof useRetailOperation>;
