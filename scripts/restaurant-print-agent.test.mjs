import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as createPrinter } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("network agent sends once across retries and records delivery rather than physical confirmation", async () => {
  let sends = 0; const states = [];
  const printer = createPrinter((socket) => { sends++; socket.on("data", () => {}); });
  await new Promise((done) => printer.listen(0, "127.0.0.1", done));
  const api = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    response.setHeader("Content-Type", "application/json");
    if (request.url.endsWith("jobs/next")) response.end(JSON.stringify({ job: { id: "fixture-job", deliveryAttempt: 0, type: "INITIAL", copies: 1, order: { code: "TEST", source: "TAKEAWAY" }, createdBy: "Test", payload: { items: [{ quantity: 1, name: "Pollo", notes: "Sin sal" }] } } }));
    else { if (request.url.endsWith("status")) states.push(JSON.parse(body).status); response.end("{}"); }
  });
  await new Promise((done) => api.listen(0, "127.0.0.1", done));
  const folder = await mkdtemp(join(tmpdir(), "movendi-print-test-"));
  const run = () => new Promise((done, reject) => {
    const child = spawn(process.execPath, [resolve("scripts/restaurant-print-agent.mjs"), "--once"], { windowsHide: true, stdio: "pipe", env: { ...process.env, PRINT_API_URL: `http://127.0.0.1:${api.address().port}`, PRINT_AGENT_TOKEN: "local-test-token", PRINT_HOST: "127.0.0.1", PRINT_PORT: String(printer.address().port), PRINT_STATE_DIR: folder } });
    child.once("error", reject); child.once("exit", (code) => code === 0 ? done() : reject(new Error(`Agent exited ${code}`)));
  });
  try { await run(); await run(); assert.equal(sends, 1); assert.deepEqual(states, ["SENT", "SENT"]); }
  finally { await new Promise((done) => api.close(done)); await new Promise((done) => printer.close(done)); }
});
