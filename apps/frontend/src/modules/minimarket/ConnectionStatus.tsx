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
  return <aside className={styles.connection} aria-label="Conexión y recuperación">
    <span className={`${styles.connectionBadge} ${!op.online || op.pending ? styles.connectionWarning : ""}`}><i />{!op.online ? "Sin conexión" : op.busy ? "Guardando…" : op.pending ? "Operación pendiente" : "Conectado"}</span>
    <details className={styles.appOptions}><summary>{waiting ? "Actualización disponible" : "Instalar / actualizar"}</summary><div>
      {waiting ? <button disabled={op.busy || !!op.pending} onClick={() => { navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true }); waiting.postMessage("ACTIVATE_UPDATE"); }}>Actualizar aplicación (conserva carrito)</button> : <p>La aplicación está actualizada.</p>}
      <strong>Instalar en el teléfono</strong><p>Android: usa «Instalar aplicación» del navegador. iPhone: Safari → Compartir → Añadir a pantalla de inicio.</p>
    </div></details>
    {!op.online ? <p className={styles.connectionAlert}>Tu carrito se conserva. Reconecta antes de cobrar.</p> : null}
    {op.pending ? <div className={styles.connectionAlert}><p>Hay una operación cuyo resultado falta confirmar. Recupérala antes de registrar otro pago.</p><button disabled={op.busy || !op.online} onClick={() => void op.recover()}>Recuperar operación pendiente</button></div> : null}
  </aside>;
}
