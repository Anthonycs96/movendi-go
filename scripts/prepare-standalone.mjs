import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appName = process.argv[2];
if (!["frontend", "backend"].includes(appName)) throw new Error("Indica frontend o backend.");

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(repositoryRoot, "apps", appName);
const standaloneApp = resolve(appRoot, ".next", "standalone", "apps", appName);

await mkdir(resolve(standaloneApp, ".next"), { recursive: true });
await cp(resolve(appRoot, ".next", "static"), resolve(standaloneApp, ".next", "static"), { recursive: true, force: true });
if (appName === "frontend") await cp(resolve(appRoot, "public"), resolve(standaloneApp, "public"), { recursive: true, force: true });
console.log(`Assets standalone preparados para ${appName}.`);
