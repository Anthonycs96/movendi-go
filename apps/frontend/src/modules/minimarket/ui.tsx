"use client";
import type { FormEvent, ReactNode } from "react";
import type { MinimarketData } from "@movendi/contracts";
import styles from "./MinimarketWorkspace.module.css";
export const n = (f: FormData, key: string) => Number(f.get(key));
export const s = (f: FormData, key: string) => String(f.get(key) ?? "");
export function Form({ children, submit, busy, disabled = false, label = "Guardar", id }: { id?: string; children: ReactNode; submit: (f: FormData) => Promise<unknown>; busy: boolean; disabled?: boolean; label?: string }) {
  return <form id={id} className={styles.panel} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!busy && !disabled) void submit(new FormData(event.currentTarget)); }}>{children}<button className={styles.primary} disabled={busy || disabled}>{busy ? "Guardando…" : label}</button></form>;
}
export function Input({ label, name, type = "text", value, required = true, step, min, max }: { label: string; name: string; type?: string; value?: string | number; required?: boolean; step?: string; min?: string; max?: string }) { return <label>{label}<input name={name} type={type} defaultValue={value} required={required} step={step} min={min} max={max} /></label>; }
export function money(data: Pick<MinimarketData, "currency">) { return (cents: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: data.currency }).format(cents / 100); }
