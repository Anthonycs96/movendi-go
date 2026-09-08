"use client";

import { Check, MonitorCog, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnchoredPopover } from "@/shared/components/ui/AnchoredPopover";

type ThemeMode = "system" | "light" | "dark";

const themeStorageKey = "saas-v2-theme-mode";
const legacyThemeStorageKey = "saas-v2-theme";
const themeChangeEvent = "movendi-theme-change";
const modes: Array<{ value: ThemeMode; label: string; description: string; Icon: typeof Sun }> = [
  { value: "system", label: "Sistema", description: "Usar el dispositivo", Icon: MonitorCog },
  { value: "light", label: "Claro", description: "Siempre claro", Icon: Sun },
  { value: "dark", label: "Oscuro", description: "Siempre oscuro", Icon: Moon },
];

function storedMode(): ThemeMode {
  const stored = window.localStorage.getItem(themeStorageKey);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function applyTheme(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function ThemeToggle() {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [mode, setMode] = useState<ThemeMode>("system");
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const dismiss = useCallback(() => setOpen(false), []);
  const closeWithFocus = useCallback(() => {
    setOpen(false);
    // Restore after the portal unmounts; WebKit can otherwise clear this focus.
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }, []);
  const current = modes.find((item) => item.value === mode) ?? modes[0];
  const CurrentIcon = current.Icon;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const nextMode = storedMode();
      applyTheme(nextMode);
      setMode(nextMode);
    };
    const syncSystemTheme = () => {
      if (storedMode() === "system") sync();
    };

    window.localStorage.removeItem(legacyThemeStorageKey);
    sync();
    const readyTimer = window.setTimeout(() => setReady(true), 0);
    window.addEventListener("storage", sync);
    window.addEventListener(themeChangeEvent, sync);
    media.addEventListener("change", syncSystemTheme);
    return () => {
      window.clearTimeout(readyTimer);
      window.removeEventListener("storage", sync);
      window.removeEventListener(themeChangeEvent, sync);
      media.removeEventListener("change", syncSystemTheme);
    };
  }, []);

  function changeMode(nextMode: ThemeMode) {
    window.localStorage.setItem(themeStorageKey, nextMode);
    window.localStorage.removeItem(legacyThemeStorageKey);
    applyTheme(nextMode);
    setMode(nextMode);
    closeWithFocus();
    window.dispatchEvent(new CustomEvent(themeChangeEvent, { detail: nextMode }));
  }

  return <div className="theme-control">
    <button ref={triggerRef} className="icon-button" type="button" disabled={!ready} onClick={() => setOpen((value) => !value)} onKeyDown={(event) => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setOpen(true); } }} aria-label={`Tema: ${current.label}`} aria-haspopup="menu" aria-expanded={open}><CurrentIcon size={18} /></button>
    {open ? <AnchoredPopover anchorRef={triggerRef} onDismiss={dismiss} className="theme-menu" role="menu" aria-label="Tema de apariencia" onKeyDown={(event) => {
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]"));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeWithFocus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>
      {modes.map(({ value, label, description, Icon }) => <button key={value} type="button" role="menuitemradio" autoFocus={mode === value} aria-checked={mode === value} onClick={() => changeMode(value)}><Icon size={16} /><span><strong>{label}</strong><small>{description}</small></span>{mode === value ? <Check size={15} /> : null}</button>)}
    </AnchoredPopover> : null}
  </div>;
}
