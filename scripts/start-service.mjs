import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [appName, defaultPort] = process.argv.slice(2);
if (!["frontend", "backend"].includes(appName)) throw new Error("Indica frontend o backend.");

process.env.PORT ??= defaultPort;
process.env.HOSTNAME ??= "0.0.0.0";
const serverPath = resolve("apps", appName, ".next", "standalone", "apps", appName, "server.js");
await import(pathToFileURL(serverPath).href);
