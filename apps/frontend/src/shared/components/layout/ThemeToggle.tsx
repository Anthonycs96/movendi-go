"use client";

import { Check, MonitorCog, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<ThemeMode>("system");
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
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
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    window.localStorage.removeItem(legacyThemeStorageKey);
    sync();
    const readyTimer = window.setTimeout(() => setReady(true), 0);
    window.addEventListener("storage", sync);
    window.addEventListener(themeChangeEvent, sync);
    media.addEventListener("change", syncSystemTheme);
    document.addEventListener("mousedown", closeOutside);
    return () => {
      window.clearTimeout(readyTimer);
      window.removeEventListener("storage", sync);
      window.removeEventListener(themeChangeEvent, sync);
      media.removeEventListener("change", syncSystemTheme);
      document.removeEventListener("mousedown", closeOutside);
    };
  }, []);

  function changeMode(nextMode: ThemeMode) {
    window.localStorage.setItem(themeStorageKey, nextMode);
    window.localStorage.removeItem(legacyThemeStorageKey);
    applyTheme(nextMode);
    setMode(nextMode);
    setOpen(false);
    window.dispatchEvent(new CustomEvent(themeChangeEvent, { detail: nextMode }));
  }

  return <div className="theme-control" ref={rootRef}>
    <button className="icon-button" type="button" disabled={!ready} onClick={() => setOpen((value) => !value)} aria-label={`Tema: ${current.label}`} aria-haspopup="menu" aria-expanded={open}><CurrentIcon size={18} /></button>
    {open ? <div className="theme-menu" role="menu" aria-label="Tema de apariencia">
      {modes.map(({ value, label, description, Icon }) => <button key={value} type="button" role="menuitemradio" aria-checked={mode === value} onClick={() => changeMode(value)}><Icon size={16} /><span><strong>{label}</strong><small>{description}</small></span>{mode === value ? <Check size={15} /> : null}</button>)}
    </div> : null}
  </div>;
}
