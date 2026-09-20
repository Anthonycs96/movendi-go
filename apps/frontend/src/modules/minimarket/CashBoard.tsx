"use client";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MinimarketData } from "@movendi/contracts";
import styles from "./MinimarketWorkspace.module.css";

export function CashSelector({ data }: { data: MinimarketData }) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  const selected = data.cashSessions.find((cash) => cash.id === data.cash?.id);
  return <section className={styles.cashIdentity} aria-label="Turno de esta operación">
    <div><strong>{selected ? `${selected.registerName} · ${selected.cashierName}` : "Sin turno seleccionado"}</strong><p>{selected ? `Abierto desde ${new Date(selected.openedAt).toLocaleString("es-PE")}` : "Abre tu turno desde Caja antes de cobrar o vincular un celular."}</p></div>
    <details className={styles.cashPicker}><summary>{selected?.registerName ?? "Seleccionar caja"} · {selected?.openedById === data.scope.actorId ? "Mi turno" : "Cambiar turno"}</summary><label>Caja de esta operación<select value={data.cash?.id ?? ""} onChange={(event) => { const query = new URLSearchParams(params); if (event.target.value) query.set("cash", event.target.value); else query.delete("cash"); router.replace(`${path}?${query}`); }}><option value="">Mi turno / abrir caja</option>{data.cashSessions.map((cash) => <option value={cash.id} key={cash.id}>{cash.registerName} · {cash.cashierName}{cash.openedById === data.scope.actorId ? " · Mi turno" : ""}</option>)}</select></label></details>
  </section>;
}
export function CashBoard({ data }: { data: MinimarketData }) {
  const router = useRouter(), path = usePathname();
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) router.refresh(); }, 10_000); return () => clearInterval(timer); }, [router]);
  return <section className={styles.panel}><div className={styles.sectionTitle}><h2>Turnos abiertos ({data.cashSessions.length})</h2><button type="button" onClick={() => router.refresh()}>Actualizar turnos</button></div><p>Los cajeros ven su turno. Los administradores pueden supervisar las cajas de esta sucursal.</p>
    <div className={styles.cashBoard}>{data.cashSessions.map((cash) => <article key={cash.id}><h3>{cash.registerName}</h3><strong>{cash.cashierName}</strong><p>En turno desde {new Date(cash.openedAt).toLocaleString("es-PE")}</p><small>{cash.scannerOnline ? "Celular conectado" : "Sin celular conectado"}</small><a href={`${path.replace(/\/checkout$/, "/pos")}?cash=${encodeURIComponent(cash.id)}`}>Ir a esta caja</a></article>)}</div>
    {!data.cashSessions.length ? <p>No tienes turnos abiertos disponibles.</p> : null}
  </section>;
}
