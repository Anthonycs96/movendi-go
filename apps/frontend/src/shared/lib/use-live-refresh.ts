"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

// One refresh at a time, with a full interval after completion. Hidden tabs do no work.
export function useLiveRefresh(intervalMs: number, enabled = true) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!enabled || pending) return;
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      clearTimeout(timer);
      if (document.visibilityState === "visible") timer = setTimeout(refresh, intervalMs);
    }
    function refresh() {
      if (document.visibilityState !== "visible") return;
      if (document.querySelector('[role="dialog"]') || document.activeElement?.matches("input, textarea, select")) {
        schedule();
        return;
      }
      startTransition(() => router.refresh());
    }
    function visibilityChanged() {
      clearTimeout(timer);
      if (document.visibilityState === "visible") refresh();
    }
    schedule();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", visibilityChanged); };
  }, [enabled, intervalMs, pending, router]);
}
