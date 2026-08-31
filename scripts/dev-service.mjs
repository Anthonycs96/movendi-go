import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { printNetworkAccess } from "./network-access.mjs";

const [appName, port, mode = "--network"] = process.argv.slice(2);
if (!['frontend', 'backend'].includes(appName) || !/^\d+$/.test(port ?? "")) {
  throw new Error("Uso: node scripts/dev-service.mjs <frontend|backend> <puerto> [--network|--local]");
}

const network = mode !== "--local";
const hostname = network ? "0.0.0.0" : "127.0.0.1";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextCli = resolve(projectRoot, "node_modules", "next", "dist", "bin", "next");

printNetworkAccess({ appName, port, network });

const child = spawn(process.execPath, [nextCli, "dev", "-H", hostname, "-p", port], {
  cwd: resolve(projectRoot, "apps", appName),
  env: { ...process.env, API_INTERNAL_URL: "http://127.0.0.1:3001" },
  stdio: "inherit",
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.once("exit", (code) => { process.exitCode = code ?? 1; });
