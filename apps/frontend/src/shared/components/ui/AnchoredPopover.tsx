"use client";

import { useLayoutEffect, useRef, type HTMLAttributes, type RefObject } from "react";
import { createPortal } from "react-dom";

/** Keep sidebar menus inside the viewport, outside transformed/scrolling ancestors. */
export function AnchoredPopover({ anchorRef, onDismiss, children, style, ...props }: HTMLAttributes<HTMLDivElement> & {
  anchorRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const menu = popover.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.width - 8));
      const above = rect.top - menu.height - 8;
      const top = Math.max(8, Math.min(above >= 8 ? above : rect.bottom + 8, window.innerHeight - menu.height - 8));
      Object.assign(popover.style, { left: `${left}px`, top: `${top}px`, visibility: "visible" });
    };
    const outside = (event: Event) => {
      if (!anchor.contains(event.target as Node) && !popover.contains(event.target as Node)) onDismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onDismiss(); requestAnimationFrame(() => anchor.focus({ preventScroll: true })); }
    };
    const resize = new ResizeObserver(position);
    resize.observe(popover);
    resize.observe(anchor.closest("aside") ?? anchor);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    position();
    if (popover.getAttribute("role") === "menu") popover.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [anchorRef, onDismiss]);
  return createPortal(<div {...props} ref={popoverRef} style={{ ...style, position: "fixed", zIndex: 1000, right: "auto", bottom: "auto", maxWidth: "calc(100vw - 16px)", maxHeight: "calc(100dvh - 16px)", overflowY: "auto", visibility: "hidden" }}>{children}</div>, document.body);
}
