"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function useRetailOperation() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const running = useRef(false);
  async function run(path: string, body: Record<string, unknown>, method = "POST") {
    if (running.current) return null;
    running.current = true; setBusy(true); setError(""); setMessage("");
    const signature = JSON.stringify({ path, body, method });
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/operations/minimarket/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: pending.current.key }) });
      const result = await response.json() as { id?: string; code?: string; totalCents?: number; changeCents?: number | null; error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "No se pudo guardar la operación.");
      pending.current = null;
      setMessage(result.code ? `Operación registrada: ${result.code}` : "Cambios guardados.");
      router.refresh(); return result;
    } catch (e) { setError(e instanceof Error ? e.message : "Error de conexión. Puedes reintentar la misma operación."); return null; }
    finally { running.current = false; setBusy(false); }
  }
  return { run, busy, message, error };
}
export type RetailOperation = ReturnType<typeof useRetailOperation>;
