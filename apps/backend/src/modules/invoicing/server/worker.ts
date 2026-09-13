import { prisma } from "@/core/database/prisma";
import { runFiscalBatch } from "./outbox";
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
async function main() {
  do {
    try { const result = await runFiscalBatch(); if (result.scanned) console.log(JSON.stringify({ event: "fiscal_batch", ...result })); }
    catch { console.error("No se pudo consultar la cola fiscal; se reintentará."); if (process.argv.includes("--once")) process.exitCode = 1; }
    if (process.argv.includes("--once")) break;
    for (let i = 0; i < 10 && !stopping; i++) await new Promise((resolve) => setTimeout(resolve, 1000));
  } while (!stopping);
}
void main().finally(() => prisma.$disconnect());
