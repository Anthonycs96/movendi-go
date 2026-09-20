"use client";
import { Children, createContext, isValidElement, useContext, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { MinimarketData } from "@movendi/contracts";
import { Dialog } from "@/shared/components/ui";
import type { RetailOperation } from "./use-operation";
import styles from "./MinimarketWorkspace.module.css";
export const n = (f: FormData, key: string) => Number(f.get(key));
export const s = (f: FormData, key: string) => String(f.get(key) ?? "");
export const RetailFeedbackContext = createContext<RetailOperation | null>(null);
export function RetailFeedback({ submitted = true, onRecovered }: { submitted?: boolean; onRecovered?: () => void }) {
  const op = useContext(RetailFeedbackContext);
  return <>{submitted && op?.error ? <p className={styles.error} role="alert">{op.error}</p> : null}{op?.pending && !op.busy ? <div className={styles.connectionAlert}><p>Confirma el resultado de la operación pendiente antes de volver a guardar.</p><button type="button" disabled={!op.online} onClick={async () => { if (await op.recover()) onRecovered?.(); }}>Recuperar operación pendiente</button></div> : null}</>;
}
export function RetailModal({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const op = useContext(RetailFeedbackContext);
  return <Dialog open={open} title={title} initialFocus="dialog" onClose={() => { if (!op?.busy) onClose(); }} className={styles.productDialog} footer={footer}><div className={styles.workspace}>{children}</div></Dialog>;
}
export function Form({ children, submit, busy, disabled = false, label = "Guardar", id, modal }: { id?: string; children: ReactNode; submit: (f: FormData) => Promise<unknown>; busy: boolean; disabled?: boolean; label?: string; modal?: { title: string; trigger?: string; initialOpen?: boolean; onClose?: () => void } }) {
  const generatedId = useId(), formId = id ?? generatedId;
  const [open, setOpen] = useState(modal?.initialOpen ?? false), [submitted, setSubmitted] = useState(false), [localError, setLocalError] = useState("");
  const running = useRef(false);
  function close() { if (!busy && !running.current) { setOpen(false); modal?.onClose?.(); } }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled || running.current) return;
    running.current = true; setSubmitted(true); setLocalError("");
    try { const result = await submit(new FormData(event.currentTarget)); if (result && modal) { setOpen(false); modal.onClose?.(); } }
    catch (error) { setLocalError(error instanceof Error ? error.message : "No se pudo guardar. Revisa los datos."); }
    finally { running.current = false; }
  }
  const button = <button type="submit" form={formId} className={modal ? styles.dialogAction : styles.primary} disabled={busy || disabled}>{busy ? "Guardando…" : label}</button>;
  const body = <form id={formId} className={styles.panel} onSubmit={send}>{modal ? Children.toArray(children).filter((child) => !isValidElement(child) || child.type !== "h2") : children}{modal ? <RetailFeedback submitted={submitted} onRecovered={() => { setOpen(false); modal.onClose?.(); }} /> : null}{localError ? <p role="alert">{localError}</p> : null}{!modal ? button : null}</form>;
  if (!modal) return body;
  return <>{!modal.initialOpen ? <button type="button" hidden={open} className={styles.primary} disabled={busy} onClick={() => { setSubmitted(false); setOpen(true); }}>{modal.trigger ?? modal.title}</button> : null}<RetailModal open={open} title={modal.title} onClose={close} footer={<div className={styles.wizardActions}><button type="button" disabled={busy} onClick={close}>Cancelar</button>{button}</div>}>{body}</RetailModal></>;
}
export function Input({ label, name, type = "text", value, required = true, step, min, max }: { label: string; name: string; type?: string; value?: string | number; required?: boolean; step?: string; min?: string; max?: string }) { return <label>{label}<input name={name} type={type} defaultValue={value} required={required} step={step} min={min} max={max} /></label>; }
export function money(data: Pick<MinimarketData, "currency">) { return (cents: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: data.currency }).format(cents / 100); }
