import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as createPrinter } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

test("network agent sends once across retries and records delivery rather than physical confirmation", async () => {
  let sends = 0; const states = []; const received = [];
  let jobId = "fixture-job", loseResponse = false;
  const printer = createPrinter((socket) => { sends++; socket.on("data", (chunk) => received.push(chunk)); });
  await new Promise((done) => printer.listen(0, "127.0.0.1", done));
  const api = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    response.setHeader("Content-Type", "application/json");
    if (request.url.endsWith("jobs/next")) { assert.equal(JSON.parse(body).protocolVersion, 2); response.end(JSON.stringify({ job: { id: jobId, deliveryAttempt: 0, attempt: 1, type: "INITIAL", copies: 1, order: { code: "TEST", source: "TAKEAWAY" }, createdBy: "Test", payload: { items: [{ quantity: 1, name: "Pollo", notes: "Sin sal" }] } } })); }
    else {
      if (request.url.endsWith("status")) {
        states.push(JSON.parse(body));
        if (loseResponse) { loseResponse = false; response.destroy(); return; }
      }
      response.end('{"protocolVersion":2}');
    }
  });
  await new Promise((done) => api.listen(0, "127.0.0.1", done));
  const folder = await mkdtemp(join(tmpdir(), "movendi-print-test-"));
  const run = (printerPort = printer.address().port) => new Promise((done, reject) => {
    const child = spawn(process.execPath, [resolve("scripts/restaurant-print-agent.mjs"), "--once"], { windowsHide: true, stdio: "pipe", env: { ...process.env, PRINT_API_URL: `http://127.0.0.1:${api.address().port}`, PRINT_AGENT_TOKEN: "local-test-token", PRINT_HOST: "127.0.0.1", PRINT_PORT: String(printerPort), PRINT_STATE_DIR: folder } });
    child.once("error", reject); child.once("exit", (code) => code === 0 ? done() : reject(new Error(`Agent exited ${code}`)));
  });
  try {
    await run(); await run(); assert.equal(sends, 1); assert.deepEqual(states, [{ status: "SENT", attempt: 1 }, { status: "SENT", attempt: 1 }]);
    const receipt = Buffer.concat(received);
    assert.match(receipt.toString("ascii"), /COMANDA\nTEST\nTAKEAWAY/);
    assert.match(receipt.toString("ascii"), /1 x Pollo\nNOTA: Sin sal/);
    assert.deepEqual([...receipt.subarray(0, 2)], [0x1b, 0x40]);
    assert.deepEqual([...receipt.subarray(-3)], [0x1d, 0x56, 0x00]);
    await writeFile(join(folder, "fixture-job-0.json"), JSON.stringify({ state: "SENDING" }));
    await run(); assert.equal(sends, 1); assert.equal(states.at(-1).status, "UNKNOWN"); assert.equal(states.at(-1).attempt, 1);
    await writeFile(join(folder, "fixture-job-0.json"), "corrupt-journal");
    await run(); assert.equal(sends, 1); assert.equal(states.length, 3);

    // Restart after the server loses its response: acknowledge again, without printing again.
    jobId = "lost-response-job"; loseResponse = true;
    await run(); await run(); assert.equal(sends, 2);
    assert.deepEqual(states.slice(-2), [{ status: "SENT", attempt: 1 }, { status: "SENT", attempt: 1 }]);

    // A closed local port represents an unplugged printer. Restoring connectivity
    // must still require operator review before another physical send.
    const offline = createPrinter();
    await new Promise((done) => offline.listen(0, "127.0.0.1", done));
    const offlinePort = offline.address().port;
    await new Promise((done) => offline.close(done));
    jobId = "offline-job";
    await run(offlinePort); await run();
    assert.equal(sends, 2);
    assert.deepEqual(states.slice(-2).map(({ status, attempt }) => ({ status, attempt })), [{ status: "UNKNOWN", attempt: 1 }, { status: "UNKNOWN", attempt: 1 }]);
    assert.ok(states.every(({ status }) => status !== "PRINTED"));
  }
  finally { await new Promise((done) => api.close(done)); await new Promise((done) => printer.close(done)); assert.ok(resolve(folder).startsWith(`${resolve(tmpdir())}${sep}movendi-print-test-`)); await rm(folder, { recursive: true, force: true }); }
});
