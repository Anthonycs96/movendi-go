const once = process.argv.includes("--once");
const apiUrl = process.env.JOB_RUNNER_API_URL?.replace(/\/$/, "");
const secret = process.env.JOB_RUNNER_SECRET;
const pollMs = Math.max(500, Number(process.env.JOB_POLL_MS ?? 2_000));

if (!apiUrl) throw new Error("JOB_RUNNER_API_URL es obligatorio.");
if (!secret || secret.length < 24) throw new Error("JOB_RUNNER_SECRET debe tener al menos 24 caracteres.");

async function processOne() {
  const headers = { "X-Job-Runner-Secret": secret };
  const audience = process.env.GOOGLE_CLOUD_RUN_AUDIENCE;
  if (audience) {
    const metadataUrl = new URL("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity");
    metadataUrl.searchParams.set("audience", audience);
    const identity = await fetch(metadataUrl, { headers: { "Metadata-Flavor": "Google" } });
    if (!identity.ok) throw new Error("No se pudo obtener la identidad del worker para invocar Cloud Run.");
    headers.Authorization = `Bearer ${await identity.text()}`;
  }
  const response = await fetch(`${apiUrl}/api/internal/jobs/transport`, { method: "POST", headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ?? `Worker API respondió ${response.status}.`);
  if (payload.processed) console.log(JSON.stringify({ event: "transport_job_processed", ...payload.result }));
  return Boolean(payload.processed);
}

do {
  const processed = await processOne();
  if (once) break;
  if (!processed) await new Promise((resolve) => setTimeout(resolve, pollMs));
} while (true);
