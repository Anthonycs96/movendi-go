"use client";
import { useId, useState, type ReactNode } from "react";
import styles from "./MinimarketWorkspace.module.css";

export function RetailTabs({ label, items }: { label: string; items: Array<{ id: string; label: string; content: ReactNode }> }) {
  const [selected, setSelected] = useState(items[0]?.id), id = useId();
  const current = items.some((item) => item.id === selected) ? selected : items[0]?.id;
  return <><div className={styles.tabs} role="tablist" aria-label={label}>{items.map((item, index) => <button key={item.id} id={`${id}-${item.id}`} role="tab" aria-selected={current === item.id} aria-controls={`${id}-${item.id}-panel`} tabIndex={current === item.id ? 0 : -1} onClick={() => setSelected(item.id)} onKeyDown={(event) => { const next = event.key === "ArrowRight" ? (index + 1) % items.length : event.key === "ArrowLeft" ? (index + items.length - 1) % items.length : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1; if (next >= 0) { event.preventDefault(); setSelected(items[next].id); document.getElementById(`${id}-${items[next].id}`)?.focus(); } }}>{item.label}</button>)}</div>{items.map((item) => <div key={item.id} hidden={current !== item.id} role="tabpanel" id={`${id}-${item.id}-panel`} aria-labelledby={`${id}-${item.id}`}>{item.content}</div>)}</>;
}
