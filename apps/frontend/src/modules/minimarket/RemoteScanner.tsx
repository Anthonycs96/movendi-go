"use client";
/* eslint-disable @next/next/no-img-element -- This QR is a small, locally generated data URL. */
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Smartphone } from "lucide-react";
import type { MinimarketData } from "@movendi/contracts";
import { Dialog } from "@/shared/components/ui";
import { BarcodeLookupError, findBarcode } from "./barcode";
import type { CartLine } from "./use-cart";
import { scopeKey } from "./use-operation";
import { scannerRequest, scannerSecret, ScannerError, type ScannerState, type ScannerCartSummary } from "./scanner-client";
import styles from "./MinimarketWorkspace.module.css";

type Credentials = { connectionId: string; receiverToken: string; pairingToken: string };
type Props = { data: MinimarketData; intentId: string; paused: boolean; cartSummary: ScannerCartSummary | null; receive: (connectionId: string, sequence: number, intentId: string, line: CartLine) => Promise<boolean>; scanStatus: (connectionId: string, sequence: number, intentId: string) => Promise<string> };
export function RemoteScanner({ data, intentId, paused, cartSummary, receive, scanStatus }: Props) {
  const context = scopeKey(data.scope), storageKey = `retail-scanner:${context}:${data.cash?.id}`;
  const [credentials, setCredentials] = useState<Credentials | null>(null), [state, setState] = useState<ScannerState | null>(null);
  const [open, setOpen] = useState(false), [qr, setQr] = useState(""), [link, setLink] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false);
  const latest = useRef({ intentId, paused, cartSummary, receive, scanStatus });
  useEffect(() => { latest.current = { intentId, paused, cartSummary, receive, scanStatus }; });
  useEffect(() => { try { const saved = sessionStorage.getItem(storageKey); if (saved) queueMicrotask(() => setCredentials(JSON.parse(saved))); } catch { /* A fresh link is still available. */ } }, [storageKey]);
  useEffect(() => {
    if (!credentials) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const auth = { connectionId: credentials.connectionId, receiverToken: credentials.receiverToken };
    const url = `${window.location.origin}/scanner#${new URLSearchParams({ id: credentials.connectionId, token: credentials.pairingToken })}`;
    void QRCode.toDataURL(url, { width: 280, margin: 2 }).then((image) => { if (!stopped) { setQr(image); setLink(url); } });
    async function poll() {
      try {
        const result = await scannerRequest({ action: "poll", ...auth, cartIntentId: latest.current.intentId, accepting: !latest.current.paused && !document.hidden, cartSummary: latest.current.cartSummary }, context);
        if (stopped) return;
        setState(result); setError("");
        for (const event of result.events ?? []) {
          if (stopped || latest.current.paused || document.hidden) break;
          let status: "ADDED" | "REJECTED" = "REJECTED", message = "La venta cambió. Vuelve a escanear.";
          const savedStatus = await latest.current.scanStatus(credentials!.connectionId, event.sequence, event.cartIntentId);
          if (savedStatus === "ADDED") { status = "ADDED"; message = `Lectura ya agregada en ${result.registerName}`; }
          else if (savedStatus === "PENDING" && event.cartIntentId === latest.current.intentId) {
            try {
              const found = await findBarcode(event.barcode, "pos", context);
              if (stopped || latest.current.paused || document.hidden) break;
              const presentation = found.product.presentations.find((p) => p.id === found.presentationId)!;
              if (!found.product.active || !presentation.active) message = "El producto o la presentación están inactivos.";
              else if (await latest.current.receive(credentials!.connectionId, event.sequence, event.cartIntentId, { presentationId: presentation.id, name: `${found.product.name} · ${presentation.name}`, priceCents: presentation.priceCents, weighted: presentation.weighted, quantity: 1 })) { status = "ADDED"; message = `${found.product.name} agregado en ${result.registerName}`; }
            } catch (cause) { if (cause instanceof BarcodeLookupError && cause.status === 404) message = cause.message; else throw cause; }
          }
          await scannerRequest({ action: "ack", ...auth, sequence: event.sequence, status, message: message.slice(0, 200) }, context);
        }
      } catch (cause) {
        if (stopped) return;
        setError(cause instanceof Error ? cause.message : "Sin conexión con el escáner.");
        if (cause instanceof ScannerError && [401, 403, 410].includes(cause.status)) { sessionStorage.removeItem(storageKey); setCredentials(null); setState(null); return; }
      }
      if (!stopped) timer = setTimeout(() => void poll(), 700);
    }
    // A duplicated browser tab must not become a second receiver of this connection.
    if (navigator.locks) void navigator.locks.request(storageKey, { ifAvailable: true }, async (lock) => {
      if (!lock) { if (!stopped) setError("El escáner está activo en otra pestaña de esta caja."); return; }
      await new Promise<void>((resolve) => {
        const finish = setInterval(() => { if (stopped) { clearInterval(finish); resolve(); } }, 200);
        void poll();
      });
    });
    else void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [credentials, context, storageKey]);
  async function connect() {
    if (!data.cash) return;
    setBusy(true); setError(""); setConflict(false);
    try {
      const receiverToken = scannerSecret(), pairingToken = scannerSecret();
      const result = await scannerRequest({ action: "connect", cashSessionId: data.cash.id, receiverToken, pairingToken, cartIntentId: intentId }, context);
      const saved = { connectionId: result.connectionId, receiverToken, pairingToken };
      sessionStorage.setItem(storageKey, JSON.stringify(saved)); setCredentials(saved); setState(result); setOpen(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo vincular."); setConflict(cause instanceof ScannerError && cause.code === "SCANNER_IN_USE"); }
    finally { setBusy(false); }
  }
  async function disconnect(reset = false) {
    setBusy(true);
    try { await scannerRequest(reset ? { action: "reset", cashSessionId: data.cash?.id } : { action: "disconnect", connectionId: credentials?.connectionId, receiverToken: credentials?.receiverToken }, context); sessionStorage.removeItem(storageKey); setCredentials(null); setState(null); setConflict(false); setOpen(false); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo desconectar."); } finally { setBusy(false); }
  }
  return <div className={styles.remoteScanner}>
    <button type="button" disabled={busy || !data.cash || !intentId} onClick={() => credentials ? setOpen(true) : void connect()}><Smartphone size={18} />{credentials ? "Ver celular vinculado" : "Vincular celular"}</button>
    {credentials ? <small role="status">{error ? "Conexión interrumpida" : paused ? "Escáner en pausa durante el cobro" : state?.phoneOnline ? "Celular conectado a esta caja" : state?.paired ? "Celular sin conexión" : "Esperando celular"}</small> : null}
    {!data.cash ? <small>Abre un turno de caja para vincular el celular.</small> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {conflict ? <button type="button" disabled={busy} onClick={() => void disconnect(true)}>Desvincular la otra PC de esta caja</button> : null}
    <Dialog open={open && !!credentials} title="Celular como escáner" onClose={() => setOpen(false)} className={styles.retailDialog}>
      <div className={styles.workspace}><h3>{state?.registerName} · {state?.cashierName}</h3><p>{state?.branchName}. Los productos llegan únicamente a esta caja y este turno.</p>
        {state?.paired ? <p>Celular vinculado. Para usar otro celular, desconecta este vínculo y genera uno nuevo.</p> : <><p>Escanea este QR con la cámara del celular. El enlace de vinculación vence en 5 minutos.</p>{qr ? <img className={styles.qrImage} src={qr} alt="QR para vincular el celular a esta caja" /> : null}<label>Enlace para el celular<input aria-label="Enlace para el celular" value={link} readOnly onFocus={(event) => event.target.select()} /></label></>}
        {error ? <p role="alert">{error}</p> : null}<button type="button" disabled={busy} onClick={() => void disconnect()}>Desconectar escáner</button><button type="button" onClick={() => setOpen(false)}>Volver a vender</button>
      </div>
    </Dialog>
  </div>;
}
