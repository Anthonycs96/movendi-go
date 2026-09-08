"use client";

/** Auth/tenant changes must discard pages prefetched with the previous session. */
export function navigateWithFreshSession(path: string, replace = false) {
  if (typeof path !== "string" || !path.startsWith("/")) throw new Error("Destino de sesión inválido.");
  const destination = new URL(path, window.location.origin);
  if (destination.origin !== window.location.origin) throw new Error("Destino de sesión inválido.");
  if (replace) window.location.replace(destination.href);
  else window.location.assign(destination.href);
}
