import { prisma } from "@/core/database/prisma";
import { processNextTransportDataJob } from "./exports";
import { maybeRunHousekeeping } from "@/core/maintenance/housekeeping";

const once = process.argv.includes("--once");
const pollMs = Math.max(500, Number(process.env.JOB_POLL_MS ?? 2_000));

async function run() {
  do {
    await maybeRunHousekeeping();
    const result = await processNextTransportDataJob();
    if (result) console.log(JSON.stringify({ event: "transport_job_processed", ...result }));
    if (once) break;
    if (!result) await new Promise((resolve) => setTimeout(resolve, pollMs));
  } while (true);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
