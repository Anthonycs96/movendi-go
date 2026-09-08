"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { OperationalNotification } from "@movendi/contracts";
import { AnchoredPopover } from "@/shared/components/ui/AnchoredPopover";

export function NotificationMenu({ items, status, onRefresh }: { items: OperationalNotification[]; status: "loading" | "ready" | "error"; onRefresh: () => Promise<void> }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const dismiss = useCallback(() => setOpen(false), []);
  return <div className="notification-wrap">
    <button ref={trigger} className="icon-button notification-button" aria-label={`Alertas operativas${items.length ? `: ${items.length}` : ""}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}><Bell size={17} />{items.length ? <span /> : null}</button>
    {open ? <AnchoredPopover anchorRef={trigger} onDismiss={dismiss} className="notification-popover" role="region" aria-label="Alertas operativas">
      <header><strong>Alertas operativas</strong><button type="button" onClick={() => void onRefresh()} disabled={status === "loading"}>Actualizar</button></header>
      {status === "loading" ? <p>Consultando el estado real…</p> : status === "error" ? <p>No pudimos cargar las alertas. Intenta nuevamente.</p> : items.length ? <div className="notification-list">{items.map((item) => <Link href={item.href} key={item.id} className={`notification-item notification-item--${item.tone}`} onClick={dismiss}><strong>{item.title}</strong><small>{item.message}</small></Link>)}</div> : <p>Todo al día. No hay alertas operativas.</p>}
    </AnchoredPopover> : null}
  </div>;
}
