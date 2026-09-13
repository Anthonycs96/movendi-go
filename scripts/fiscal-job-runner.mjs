import { setTimeout as delay } from "node:timers/promises";

const api = new URL(process.env.JOB_RUNNER_API_URL ?? "http://127.0.0.1:3001");
const secret = process.env.JOB_RUNNER_SECRET;
if (!secret || secret.length < 24) throw new Error("Configura JOB_RUNNER_SECRET con al menos 24 caracteres.");
if (api.protocol !== "https:" && !(api.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(api.hostname))) throw new Error("El ejecutor fiscal requiere HTTPS fuera de loopback.");
if (api.username || api.password) throw new Error("No incluyas credenciales en la URL.");
const once = process.argv.includes("--once");
const shutdown = new AbortController();
process.on("SIGINT", () => shutdown.abort());
process.on("SIGTERM", () => shutdown.abort());

do {
  let scanned = 0;
  try {
    const response = await fetch(new URL("/api/internal/jobs/fiscal", api), { method: "POST", redirect: "error", headers: { "X-Job-Runner-Secret": secret }, signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(120_000)]) });
    if (!response.ok) throw new Error(`Worker fiscal: HTTP ${response.status}`);
    const result = await response.json();
    if (result.ok !== true || !Number.isInteger(result.scanned) || result.scanned < 0 || result.scanned > 1 || !Number.isInteger(result.completed) || result.completed < 0 || result.completed > result.scanned) throw new Error("Respuesta inválida del worker fiscal.");
    scanned = result.scanned;
    console.log(JSON.stringify({ event: "fiscal_runner_batch", scanned, completed: result.completed }));
  } catch (error) {
    if (!shutdown.signal.aborted) console.error(error instanceof Error ? error.message : "Fallo del worker fiscal.");
    if (once) process.exitCode = 1;
  }
  if (once || shutdown.signal.aborted) break;
  await delay(scanned ? 500 : 10_000, undefined, { signal: shutdown.signal }).catch(() => {});
} while (!shutdown.signal.aborted);
