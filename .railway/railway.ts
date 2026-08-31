import { bucket, defineRailway, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  const Files = bucket("Files", { region: "sjc" });
  const backend = service("backend", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.backend" },
    start: "node apps/backend/server.js",
    healthcheck: "/api/ready",
    healthcheckTimeout: 300,
    replicas: { "sfo": 1 },
    deploy: {
      preDeployCommand: ["npm run db:deploy:prod"],
      restartPolicyMaxRetries: 3,
    },
    env: { ALLOW_LOG_EMAIL: preserve(), ALLOW_MOCK_BILLING: preserve(), ANTIVIRUS_MODE: preserve(), APP_PUBLIC_URL: preserve(), BILLING_PROVIDER: preserve(), BOOTSTRAP_ADMIN_EMAIL: preserve(), BOOTSTRAP_ADMIN_NAME: preserve(), BOOTSTRAP_ADMIN_PASSWORD: preserve(), BOOTSTRAP_BRANCH_NAME: preserve(), BOOTSTRAP_TENANT_NAME: preserve(), BOOTSTRAP_TENANT_SLUG: preserve(), BOOTSTRAP_TENANT_TYPE: preserve(), DATABASE_URL: preserve(), DEPLOYMENT_VERSION: preserve(), EMAIL_PROVIDER: preserve(), JOB_RUNNER_SECRET: preserve(), OBJECT_STORAGE_PROVIDER: preserve(), REQUIRE_ANTIVIRUS: preserve(), S3_ACCESS_KEY_ID: preserve(), S3_BUCKET: preserve(), S3_ENDPOINT: preserve(), S3_FORCE_PATH_STYLE: preserve(), S3_REGION: preserve(), S3_SECRET_ACCESS_KEY: preserve(), SESSION_COOKIE_NAME: preserve(), SESSION_TTL_HOURS: preserve() },
  });
  const TransportWorker = service("TransportWorker", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.backend" },
    start: "node scripts/transport-job-runner.mjs",
    replicas: { "sfo": 1 },
    deploy: { restartPolicyMaxRetries: 5 },
    networking: { privateNetworkEndpoint: "transportworker" },
    env: { JOB_POLL_MS: preserve(), JOB_RUNNER_API_URL: preserve(), JOB_RUNNER_SECRET: preserve() },
  });
  const frontend = service("frontend", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.frontend" },
    start: "node apps/frontend/server.js",
    healthcheck: "/api/frontend-health",
    healthcheckTimeout: 300,
    replicas: { "sfo": 1 },
    deploy: { restartPolicyMaxRetries: 3 },
    env: {
      API_INTERNAL_URL: preserve(),
      DEPLOYMENT_VERSION: "railway-production",
      PORT: preserve(),
    },
  });

  return project("MOVENDI-GO", {
    resources: [backend, TransportWorker, frontend, Files],
  });
});
