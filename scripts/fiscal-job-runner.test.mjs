import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

test("fiscal runner authenticates, reports failures, resumes and refuses insecure destinations", async () => {
  const secret = "fiscal-runner-test-not-a-real-secret";
  let mode = "ok", requests = 0;
  const server = createServer((request, response) => {
    requests++;
    assert.equal(request.url, "/api/internal/jobs/fiscal");
    assert.equal(request.method, "POST");
    assert.equal(request.headers["x-job-runner-secret"], secret);
    if (mode === "unavailable") { response.writeHead(503); response.end(); }
    else if (mode === "redirect") { response.writeHead(302, { Location: "/wrong" }); response.end(); }
    else if (mode === "invalid") response.end('{"ok":true}');
    else response.end('{"ok":true,"scanned":1,"completed":1}');
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${server.address().port}`;
  const run = (api = url) => new Promise((done, reject) => {
    const child = spawn(process.execPath, [resolve("scripts/fiscal-job-runner.mjs"), "--once"], { windowsHide: true, stdio: "pipe", env: { ...process.env, JOB_RUNNER_API_URL: api, JOB_RUNNER_SECRET: secret } });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => { assert.ok(!output.includes(secret)); done({ code, output }); });
  });
  try {
    assert.equal((await run()).code, 0);
    mode = "unavailable";
    const unavailable = await run(); assert.equal(unavailable.code, 1); assert.match(unavailable.output, /HTTP 503/);
    mode = "ok"; assert.equal((await run()).code, 0);
    mode = "invalid"; assert.equal((await run()).code, 1);
    mode = "redirect"; const beforeRedirect = requests; assert.equal((await run()).code, 1); assert.equal(requests, beforeRedirect + 1);
    const beforeRejected = requests;
    assert.equal((await run("http://example.com")).code, 1);
    assert.equal((await run("http://user:password@127.0.0.1")).code, 1);
    assert.equal(requests, beforeRejected);
  } finally { await new Promise((done) => server.close(done)); }
});
