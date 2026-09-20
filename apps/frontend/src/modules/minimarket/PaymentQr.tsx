"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated QR images and local previews must bypass the image optimizer. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MinimarketData } from "@movendi/contracts";
import { localizeCode } from "@/shared/lib/localization";
import { Dialog } from "@/shared/components/ui";
import { scopeKey, type RetailOperation } from "./use-operation";
import { Form, money } from "./ui";
import styles from "./MinimarketWorkspace.module.css";

const qrUrl = (qr: MinimarketData["paymentQrs"][number]) => `/api/minimarket/payment-qr?${new URLSearchParams({ id: qr.id, v: qr.updatedAt })}`;
export function PaymentQrDisplay({ data, method, amountCents }: { data: MinimarketData; method: string; amountCents: number }) {
  const qr = data.paymentQrs.find((item) => item.method === method);
  if (!qr || amountCents <= 0) return null;
  return <section className={styles.paymentQr}><h3>{localizeCode(method)} · {money(data)(amountCents)}</h3><img src={qrUrl(qr)} className={styles.qrImage} alt={`QR de cobro ${localizeCode(method)}`} /><strong>Titular: {qr.payee}</strong><p>El cliente escanea este QR y paga el importe indicado. Verifica el abono en tu cuenta antes de confirmar.</p></section>;
}
export function PaymentQrSettings({ data, op }: { data: MinimarketData; op: RetailOperation }) {
  const router = useRouter();
  const [method, setMethod] = useState<string | null>(null), [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const selected = data.paymentQrs.find((qr) => qr.method === method);
  useEffect(() => { if (!file) return; const url = URL.createObjectURL(file); queueMicrotask(() => setPreview(url)); return () => URL.revokeObjectURL(url); }, [file]);
  async function save(form: FormData) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/minimarket/payment-qr", { method: "POST", headers: { "X-Retail-Context": scopeKey(data.scope) }, body: form, signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "No se pudo guardar el QR.");
      setMethod(null); setFile(null); setPreview(""); setMessage(result.removed ? "QR retirado de esta sucursal." : "QR guardado para esta sucursal."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar."); } finally { setBusy(false); }
  }
  return <section className={styles.panel}><h2>QR para recibir pagos</h2><p>Sube tu QR de Yape, Plin u otra cuenta. Se comparte entre las cajas de esta sucursal; cada venta conserva su propia caja, cajero y medio de pago.</p><p>Mostrar un QR no confirma el depósito automáticamente.</p>
    <Form key={data.paymentMethods.join(",")} modal={{ title: "Medios de pago del negocio", trigger: "Configurar medios de pago" }} busy={op.busy} label="Guardar medios de pago" submit={(form) => op.run("payment-methods", { methods: form.getAll("method") })}><p>Estos medios se habilitan en todas las sucursales del negocio. Selecciona al menos uno.</p>{["CASH", "CARD", "YAPE", "PLIN", "TRANSFER", "OTHER"].map((value) => <label className={styles.checkLabel} key={value}><input name="method" type="checkbox" value={value} defaultChecked={data.paymentMethods.includes(value)} />{localizeCode(value)}</label>)}</Form>
    <div className={styles.qrSettings}>{["YAPE", "PLIN", "TRANSFER", "OTHER"].map((value) => {
      const qr = data.paymentQrs.find((item) => item.method === value);
      return <article key={value}><h3>{value === "OTHER" ? "Otro QR" : localizeCode(value)}</h3>{qr ? <><img src={qrUrl(qr)} alt={`QR guardado ${localizeCode(value)}`} /><p>{qr.payee}</p></> : <p>Sin QR configurado</p>}{!data.paymentMethods.includes(value) ? <p className={styles.muted}>Activa este medio en los métodos de pago del negocio para usarlo al cobrar.</p> : null}<button type="button" onClick={() => { setMethod(value); setFile(null); setPreview(""); setError(""); }}>{qr ? "Cambiar QR" : "Subir QR"} de {localizeCode(value)}</button></article>;
    })}</div>{message ? <p role="status">{message}</p> : null}
    <Dialog open={!!method} title={`QR de ${localizeCode(method ?? "")}`} onClose={() => { if (!busy) setMethod(null); }} className={styles.retailDialog}>
      <form key={method} className={styles.workspace} onSubmit={(event) => { event.preventDefault(); void save(new FormData(event.currentTarget)); }}>
        <input type="hidden" name="method" value={method ?? ""} /><label>Titular de la cuenta<input name="payee" required minLength={2} maxLength={120} defaultValue={selected?.payee ?? ""} /></label>
        <label>Imagen de tu QR<input type="file" name="image" accept="image/png,image/jpeg,image/webp" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><small>PNG, JPG o WebP, máximo 2 MB. Revisa que el QR y el titular correspondan a tu cuenta.</small>
        {preview ? <img className={styles.qrImage} src={preview} alt="Vista previa de tu QR" /> : null}{error ? <p role="alert" className={styles.error}>{error}</p> : null}
        <button type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar QR"}</button>{selected ? <button type="button" disabled={busy} onClick={() => { const form = new FormData(); form.set("method", method!); form.set("remove", "true"); void save(form); }}>Retirar QR</button> : null}
      </form>
    </Dialog>
  </section>;
}
