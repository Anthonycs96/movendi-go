"use client";
import { useEffect, useState } from "react";
import type { RetailOperation } from "./use-operation";
import styles from "./MinimarketWorkspace.module.css";
export function ConnectionStatus({ op }: { op: RetailOperation }) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let alive = true;
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
      if (!alive) return;
      if (registration.waiting) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => { const worker = registration.installing; worker?.addEventListener("statechange", () => { if (alive && worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker); }); });
      void registration.update();
    }).catch(() => { /* Browser operation remains available when installation is unsupported. */ });
    return () => { alive = false; };
  }, []);
  return <aside className={styles.panel} aria-label="Conexión y recuperación"><strong>{!op.online ? "SIN CONEXIÓN" : op.busy ? "SINCRONIZANDO" : op.error && op.pending ? "ERROR DE SINCRONIZACIÓN" : "ONLINE"}</strong>
    {!op.online ? <p>Puedes conservar el carrito. Reconecta para verificar stock, caja, precios y comprobantes antes de cobrar.</p> : null}
    {op.pending ? <div><p>Operación pendiente: {op.pending.path} · {new Date(op.pending.createdAt).toLocaleString("es-PE")}. El resultado aún debe confirmarse. No registres el mismo pago como una venta nueva.</p><button disabled={op.busy || !op.online} onClick={() => void op.recover()}>Recuperar operación pendiente</button></div> : null}
    {waiting ? <button disabled={op.busy || !!op.pending} onClick={() => { navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true }); waiting.postMessage("ACTIVATE_UPDATE"); }}>Actualizar aplicación (conserva carrito)</button> : null}
    <details><summary>Instalar en el teléfono</summary><p>En Android usa «Instalar aplicación» del navegador. En iPhone abre Safari, Compartir → Añadir a pantalla de inicio. La disponibilidad depende del navegador y de la conexión HTTPS.</p></details>
  </aside>;
}
