import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { printNetworkAccess } from "./network-access.mjs";

const network = process.argv.includes("--network");
const hostname = network ? "0.0.0.0" : "127.0.0.1";
const nextCli = resolve("node_modules", "next", "dist", "bin", "next");
const services = [
  { appName: "backend", cwd: resolve("apps", "backend"), port: "3001" },
  { appName: "frontend", cwd: resolve("apps", "frontend"), port: "3000" },
];

for (const service of services) printNetworkAccess({ appName: service.appName, port: service.port, network });

const children = services.map((service) => spawn(process.execPath, [nextCli, "dev", "-H", hostname, "-p", service.port], {
  cwd: service.cwd,
  env: { ...process.env, API_INTERNAL_URL: "http://127.0.0.1:3001" },
  stdio: "inherit",
}));

function shutdown(signal) {
  for (const child of children) if (!child.killed) child.kill(signal);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
await Promise.all(children.map((child) => new Promise((resolveExit) => child.once("exit", resolveExit))));
