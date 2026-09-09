import { createConnection, isIP } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const api = new URL(process.env.PRINT_API_URL ?? "http://localhost:3000");
const token = process.env.PRINT_AGENT_TOKEN;
const host = process.env.PRINT_HOST;
const port = Number(process.env.PRINT_PORT ?? 9100);
if (!["https:", "http:"].includes(api.protocol)) throw new Error("PRINT_API_URL debe usar HTTP o HTTPS.");
if (!token || !host || !isIP(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Configura PRINT_API_URL, PRINT_AGENT_TOKEN, PRINT_HOST (IP) y PRINT_PORT.");
if (api.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(api.hostname) && process.env.PRINT_ALLOW_HTTP !== "true") throw new Error("Usa HTTPS para proteger el token. En una red local controlada puedes habilitar PRINT_ALLOW_HTTP=true.");
const stateDir = resolve(process.env.PRINT_STATE_DIR ?? ".print-agent-state");
await mkdir(stateDir, { recursive: true });
async function call(path, data = {}, method = "POST") {
  const response = await fetch(new URL(`/api/print-agent/${path}`, api), { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Servidor de impresión: HTTP ${response.status}`);
  return response.json();
}
function plain(value) { return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e\n]/g, " "); }
function receipt(job) {
  const lines = [job.payload.printerName ?? "Movendi", job.type === "CANCELLATION" ? "*** ANULACION ***" : "COMANDA", job.order.code, job.order.tableName ?? job.order.source, `Atendio: ${job.createdBy}`, "------------------------------"];
  for (const section of job.payload.sections?.length ? job.payload.sections : [{ areaName: "General", items: job.payload.items ?? [] }]) {
    lines.push(section.areaName);
    for (const item of section.items) { lines.push(`${item.quantity} x ${item.name}`); if (item.notes) lines.push(`NOTA: ${item.notes}`); }
  }
  if (job.payload.orderNotes || job.order.notes) lines.push(`NOTA GENERAL: ${job.payload.orderNotes || job.order.notes}`);
  return Buffer.concat([Buffer.from([0x1b,0x40]), Buffer.from(plain(lines.join("\n")) + "\n\n\n", "ascii"), Buffer.from([0x1d,0x56,0x00])]);
}
async function send(bytes) {
  await new Promise((done, reject) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(10000);
    socket.once("timeout", () => socket.destroy(new Error("La impresora no respondió a tiempo.")));
    socket.once("error", reject);
    socket.once("connect", () => socket.end(bytes));
    socket.once("close", (hadError) => { if (!hadError) done(); });
  });
}
await call("heartbeat");
console.log("Agente conectado. Los envíos quedan pendientes de verificar en Cocina.");
for (;;) {
  try {
    const { job } = await call("jobs/next");
    if (job) {
      if (!/^[a-zA-Z0-9-]+$/.test(job.id) || !Number.isInteger(job.deliveryAttempt) || job.deliveryAttempt < 0) throw new Error("Identificador de comanda inválido.");
      const journal = resolve(stateDir, `${job.id}-${job.deliveryAttempt}.json`);
      const prior = await readFile(journal, "utf8").then(JSON.parse, () => null);
      if (prior?.state === "SENT") {
        await call(`jobs/${job.id}/status`, { status: "SENT" }, "PATCH");
      } else if (prior) {
        await call(`jobs/${job.id}/status`, { status: "FAILED", error: "Envío previo incierto. Verifica el papel antes de habilitar una reimpresión en el agente." }, "PATCH");
      } else {
        await writeFile(journal, JSON.stringify({ state: "SENDING", at: new Date().toISOString() }), { flag: "wx", flush: true });
        try {
          for (let copy = 0; copy < Math.max(1, Math.min(5, job.copies)); copy++) await send(receipt(job));
          await writeFile(journal, JSON.stringify({ state: "SENT", at: new Date().toISOString() }), { flush: true });
          await call(`jobs/${job.id}/status`, { status: "SENT" }, "PATCH");
          console.log(`Comanda ${job.id} enviada al equipo; confirma su salida en Cocina.`);
        } catch (error) {
          const saved = await readFile(journal, "utf8").then(JSON.parse);
          if (saved.state !== "SENT") await call(`jobs/${job.id}/status`, { status: "FAILED", error: "Envío incierto: revisa conexión y papel antes de reimprimir." }, "PATCH");
          throw error;
        }
      }
    }
  } catch (error) { console.error(error instanceof Error ? error.message : "Error del agente"); }
  if (process.argv.includes("--once")) break;
  await new Promise((done) => setTimeout(done, 2000));
}
