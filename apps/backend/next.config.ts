import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: resolve(projectRoot, "../.."),
  transpilePackages: ["@movendi/contracts"],
  deploymentId: process.env.DEPLOYMENT_VERSION,
  poweredByHeader: false,
  typedRoutes: false,
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.119"],
  turbopack: { root: resolve(projectRoot, "../..") },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    ] }];
  },
};

export default nextConfig;
