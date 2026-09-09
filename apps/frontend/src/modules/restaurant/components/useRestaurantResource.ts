"use client";
import { useEffect, useState } from "react";
export function useRestaurantResource<T>(url: string) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ url: string; data?: T; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "No pudimos cargar la información.");
      if (!controller.signal.aborted) setResult({ url, data });
    }).catch((error: Error) => { if (!controller.signal.aborted) setResult({ url, error: error.message }); });
    return () => controller.abort();
  }, [url, revision]);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("restaurant-operation-completed", refresh);
    return () => window.removeEventListener("restaurant-operation-completed", refresh);
  }, []);
  return { data: result?.url === url ? result.data : undefined, error: result?.url === url ? result.error : undefined, refresh: () => setRevision((value) => value + 1) };
}
