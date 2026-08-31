import { spawn } from "node:child_process";
import { resolve } from "node:path";

const dev = process.argv.includes("--dev");
const nextCli = resolve("node_modules", "next", "dist", "bin", "next");
const services = [
  { name: "backend", cwd: resolve("apps", "backend"), port: "3101", env: { JOB_RUNNER_SECRET: process.env.JOB_RUNNER_SECRET ?? "phase-3-e2e-worker-secret-0001", JOB_RETRY_BASE_SECONDS: "1" } },
  { name: "frontend", cwd: resolve("apps", "frontend"), port: "3100", env: { API_INTERNAL_URL: "http://127.0.0.1:3101" } },
];

const children = services.map(({ name, cwd, port, env }) => spawn(process.execPath, dev
  ? [nextCli, "dev", "-H", "127.0.0.1", "-p", port]
  : [resolve("scripts", "start-service.mjs"), name, port], {
  cwd: dev ? cwd : process.cwd(),
  env: { ...process.env, ...env, PORT: port, HOSTNAME: "127.0.0.1" },
  stdio: "inherit",
}));

function shutdown(signal) {
  for (const child of children) if (!child.killed) child.kill(signal);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
await Promise.all(children.map((child) => new Promise((resolveExit) => child.once("exit", resolveExit))));
