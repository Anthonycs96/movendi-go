// Loopback-only TLS for testing production Secure cookies, including WebKit.
// The ephemeral private key stays in memory and is never used by the application.
import { createServer } from "node:https";
import { request } from "node:http";
import { generate } from "selfsigned";

export async function startLocalHttpsProxy() {
  const certificate = await generate([{ name: "commonName", value: "localhost" }], {
    algorithm: "sha256", keySize: 2048,
    notAfterDate: new Date(Date.now() + 86_400_000),
    extensions: [{ name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] }],
  });
  const server = createServer({ key: certificate.private, cert: certificate.cert }, (incoming, outgoing) => {
    const upstream = request({ hostname: "127.0.0.1", port: 3100, method: incoming.method, path: incoming.url, headers: { ...incoming.headers, "x-forwarded-proto": "https", "x-forwarded-host": "localhost:3443" } }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end("Local E2E frontend unavailable"); });
    incoming.on("aborted", () => upstream.destroy());
    incoming.pipe(upstream);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(3443, "127.0.0.1", resolve); });
  return async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); };
}
