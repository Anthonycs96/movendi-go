import "server-only";

let identityToken: { value: string; expiresAt: number } | null = null;

async function getCloudRunIdentityToken() {
  const audience = process.env.GOOGLE_CLOUD_RUN_AUDIENCE;
  if (!audience) return null;
  if (identityToken && identityToken.expiresAt > Date.now() + 60_000) return identityToken.value;

  const metadataUrl = new URL("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity");
  metadataUrl.searchParams.set("audience", audience);
  const response = await fetch(metadataUrl, { headers: { "Metadata-Flavor": "Google" }, cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo obtener la identidad del frontend para invocar el backend privado.");
  const value = await response.text();
  const payload = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8")) as { exp?: number };
  identityToken = { value, expiresAt: (payload.exp ?? 0) * 1000 };
  return value;
}

export async function backendFetch(input: string | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = await getCloudRunIdentityToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
