"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Monitor, ShoppingBag, ScanLine, Store } from "lucide-react";
import { BarcodeScanner } from "@/shared/barcode/BarcodeScanner";
import { scannerRequest, scannerSecret, ScannerError, type ScannerState } from "./scanner-client";
import styles from "./ScannerPhone.module.css";

type PhoneLink = { connectionId: string; pairingToken: string; senderToken: string };
type PendingScan = { requestId: string; barcode: string };
export function ScannerPhone() {
  const [link, setLink] = useState<PhoneLink | null>(null), [state, setState] = useState<ScannerState | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [pending, setPending] = useState<PendingScan | null>(null), [busy, setBusy] = useState(false);
  const [scannerVersion, setScannerVersion] = useState(0);
  const [messageIsError, setMessageIsError] = useState(false);
  const running = useRef(false), alive = useRef(true);
  const pendingKey = link ? `retail-phone-pending:${link.connectionId}` : "";
  useEffect(() => {
    alive.current = true;
    try {
      const hash = new URLSearchParams(window.location.hash.slice(1)), connectionId = hash.get("id"), pairingToken = hash.get("token");
      const saved = sessionStorage.getItem("retail-scanner-phone"), previous = saved ? JSON.parse(saved) as PhoneLink : null;
      const selected = connectionId && pairingToken ? previous?.connectionId === connectionId ? previous : { connectionId, pairingToken, senderToken: scannerSecret() } : previous?.connectionId === connectionId ? previous : null;
      if (!selected) throw new Error("Abre el enlace o escanea el QR de vinculación desde la PC.");
      sessionStorage.setItem("retail-scanner-phone", JSON.stringify(selected));
      history.replaceState(null, "", `${window.location.pathname}#${new URLSearchParams({ id: selected.connectionId })}`);
      const stored = sessionStorage.getItem(`retail-phone-pending:${selected.connectionId}`);
      queueMicrotask(() => { setLink(selected); if (stored) setPending(JSON.parse(stored)); });
    } catch (cause) { queueMicrotask(() => setError(cause instanceof Error ? cause.message : "No se pudo guardar el vínculo en este celular.")); }
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (!link) return;
    let stopped = false, paired = false, timer: ReturnType<typeof setTimeout>;
    async function heartbeat() {
      try {
        const result = await scannerRequest(paired ? { action: "status", connectionId: link!.connectionId, senderToken: link!.senderToken } : { action: "pair", ...link });
        paired = true;
        if (!stopped) { setState(result); setError(""); }
      } catch (cause) { if (!stopped) { setState(null); setError(cause instanceof Error ? cause.message : "Sin conexión con la PC."); } }
      if (!stopped) timer = setTimeout(() => void heartbeat(), 2000);
    }
    void heartbeat(); return () => { stopped = true; clearTimeout(timer); };
  }, [link]);
  async function send(scan: PendingScan) {
    if (!link || running.current) return;
    running.current = true; setBusy(true); setMessage("");
    const clear = () => { sessionStorage.removeItem(pendingKey); setPending(null); };
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(scan)); setPending(scan);
      const auth = { connectionId: link.connectionId, senderToken: link.senderToken };
      let result = await scannerRequest({ action: "scan", ...auth, ...scan });
      for (let attempt = 0; attempt < 20 && result.event?.status === "PENDING" && alive.current; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        result = await scannerRequest({ action: "status", ...auth, requestId: scan.requestId });
      }
      if (!alive.current) return;
      if (result.event?.status === "ADDED") { clear(); const text = result.event.message ?? "Producto agregado en la PC."; return { title: text, detail: `Código: ${scan.barcode}` }; }
      if (result.event?.status === "REJECTED") { clear(); throw new Error(result.event.message ?? "La PC rechazó esta lectura."); }
      throw new Error("La PC aún no confirmó. Usa «Revisar lectura pendiente» para consultar sin duplicar el producto.");
    } catch (cause) {
      // Definite rejection can be retried as a new scan; transport uncertainty keeps its request id.
      if (cause instanceof ScannerError && [400, 403, 409, 410].includes(cause.status)) clear();
      throw cause;
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  const summary = state?.cartSummary;
  const units = summary ? new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 }).format(summary.units) : "—";
  const total = summary ? new Intl.NumberFormat("es-PE", { style: "currency", currency: summary.currency }).format(summary.totalCents / 100) : "—";
  return <main className={styles.phone}>
    <header className={styles.header}>
      <div className={styles.brand}><span className={styles.logo}><Store size={23} /></span><div><strong>{state?.tenantName ?? "Escáner de caja"}</strong><small>{state?.branchName ?? "Vinculando con tu negocio"}</small></div><span className={styles.mode}><Monitor size={12} />POS en PC</span></div>
      {state ? <div className={styles.cash}><strong>{state.registerName}</strong><span>Turno de {state.cashierName}</span></div> : null}
    </header>
    <section className={styles.content} aria-label="Escáner de productos">
      <div className={styles.title}><h1><ScanLine size={20} />Escanear productos</h1><span className={state?.accepting ? styles.online : styles.paused}>{state?.accepting ? "En línea" : "En espera"}</span></div>
      <p className={styles.connection} role="status">{state?.accepting ? "PC lista para recibir productos" : "PC en pausa o sin conexión. Vuelve a la venta en la PC."}</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {pending ? <section className={styles.pending}><p>Lectura pendiente: {pending.barcode}. No vuelvas a escanear este artículo hasta conocer el resultado.</p><button disabled={busy} type="button" onClick={() => void send(pending).then((result) => { setMessageIsError(false); setMessage(result?.title ?? ""); setScannerVersion((value) => value + 1); }).catch((cause) => { setMessageIsError(true); setMessage(cause instanceof Error ? cause.message : "No se pudo confirmar."); })}>{busy ? "Esperando confirmación…" : "Revisar lectura pendiente"}</button></section> : null}
      {link ? <BarcodeScanner key={scannerVersion} compact disabled={!state?.accepting} onScan={async (barcode) => {
        if (pending) throw new Error("Revisa primero la lectura pendiente para evitar duplicados.");
        return send({ requestId: crypto.randomUUID(), barcode });
      }} /> : null}
      {message ? <p className={messageIsError ? styles.error : styles.recovered} role={messageIsError ? "alert" : "status"}>{!messageIsError ? <CheckCircle2 size={20} /> : null}{message}</p> : null}
    </section>
    <footer className={styles.footer}>
      <div className={styles.summary} aria-label="Resumen de la venta en la PC" aria-live="polite"><ShoppingBag size={20} /><span>{units} artículos en venta</span><div><small>{summary?.verified ? "Total" : "Total estimado"}</small><strong>{total}</strong></div></div>
      <p><Monitor size={15} />Revisa los productos y cobra en la PC</p>
    </footer>
  </main>;
}
