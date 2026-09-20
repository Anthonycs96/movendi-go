"use client";
import { useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import { BarcodeScanner } from "@/shared/barcode/BarcodeScanner";
import { scannerRequest, scannerSecret, ScannerError, type ScannerState } from "./scanner-client";
import styles from "./MinimarketWorkspace.module.css";

type PhoneLink = { connectionId: string; pairingToken: string; senderToken: string };
type PendingScan = { requestId: string; barcode: string };
export function ScannerPhone() {
  const [link, setLink] = useState<PhoneLink | null>(null), [state, setState] = useState<ScannerState | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [pending, setPending] = useState<PendingScan | null>(null), [busy, setBusy] = useState(false);
  const [scannerVersion, setScannerVersion] = useState(0);
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
      if (result.event?.status === "ADDED") { clear(); const text = result.event.message ?? "Producto agregado en la PC."; setMessage(text); return text; }
      if (result.event?.status === "REJECTED") { clear(); throw new Error(result.event.message ?? "La PC rechazó esta lectura."); }
      throw new Error("La PC aún no confirmó. Usa «Revisar lectura pendiente» para consultar sin duplicar el producto.");
    } catch (cause) {
      // Definite rejection can be retried as a new scan; transport uncertainty keeps its request id.
      if (cause instanceof ScannerError && [400, 403, 409, 410].includes(cause.status)) clear();
      throw cause;
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return <main className={`${styles.workspace} ${styles.phoneScanner}`}>
    <header><Smartphone size={30} /><h1>Escáner de caja</h1><p>Usa este celular para enviar productos a la PC.</p></header>
    {state ? <section className={styles.panel}><strong>{state.tenantName} · {state.branchName}</strong><h2>{state.registerName}</h2><p>Cajero: {state.cashierName}</p><p role="status">{state.accepting ? "PC lista para recibir productos" : "PC en pausa o sin conexión. Vuelve a la venta en la PC."}</p></section> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {pending ? <section className={styles.notice}><p>Lectura pendiente: {pending.barcode}. No vuelvas a escanear este artículo hasta conocer el resultado.</p><button disabled={busy} type="button" onClick={() => void send(pending).then(() => setScannerVersion((value) => value + 1)).catch((cause) => setMessage(cause instanceof Error ? cause.message : "No se pudo confirmar."))}>{busy ? "Esperando confirmación…" : "Revisar lectura pendiente"}</button></section> : null}
    {link ? <BarcodeScanner key={scannerVersion} disabled={!state?.accepting} onScan={async (barcode) => {
      if (pending) throw new Error("Revisa primero la lectura pendiente para evitar duplicados.");
      return send({ requestId: crypto.randomUUID(), barcode });
    }} /> : null}
    {message ? <p role="status">{message}</p> : null}
    <p className={styles.muted}>Los cobros y las cantidades se revisan en la PC. Este vínculo no permite cobrar ni cambiar de caja.</p>
  </main>;
}
