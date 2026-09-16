"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/shared/lib/cn";

const subscribeToClient = () => () => undefined;

export function Dialog({ open, title, description, children, onClose, footer, className, initialFocus = "field" }: { open: boolean; title: string; description?: string; children: ReactNode; onClose: () => void; footer?: ReactNode; className?: string; initialFocus?: "field" | "dialog" }) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const mounted = useSyncExternalStore(subscribeToClient, () => true, () => false);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const initial = initialFocus === "dialog" ? dialogRef.current : dialogRef.current?.querySelector<HTMLElement>("[autofocus]")
        ?? dialogRef.current?.querySelector<HTMLElement>("input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled])")
        ?? dialogRef.current?.querySelector<HTMLElement>("button:not([disabled])");
      (initial ?? dialogRef.current)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open, initialFocus]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), summary, [href], [tabindex]:not([tabindex='-1'])")].filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open || !mounted) return null;
  return createPortal(
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} className={cn("dialog", className)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={handleKeyDown} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></header>
        <div className="dialog__content">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title, description, onCancel, onConfirm }: { open: boolean; title: string; description: string; onCancel: () => void; onConfirm: () => void }) {
  return <Dialog open={open} title={title} description={description} onClose={onCancel} footer={<><Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button><Button type="button" variant="danger" onClick={onConfirm}>Confirmar</Button></>}><p className="dialog__question">Esta acción quedará registrada en la auditoría del negocio.</p></Dialog>;
}
