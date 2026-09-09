"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function useRestaurantLive(enabled = true) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [connected, setConnected] = useState(true);
  const revision = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || pending) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (document.visibilityState !== "visible") { timer = setTimeout(poll, 2000); return; }
      try {
        const response = await fetch("/api/data/restaurant-revision", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Disconnected");
        const result = await response.json() as { revision: string };
        setConnected(true);
        const editing = document.querySelector('[role="dialog"]') || document.activeElement?.matches('input:not([type="checkbox"]):not([type="radio"]), textarea');
        if (result.revision !== revision.current && !editing) {
          revision.current = result.revision;
          startTransition(() => router.refresh());
        }
      } catch { if (!controller.signal.aborted) setConnected(false); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [enabled, pending, router]);
  return { connected, pending };
}
