import "server-only";
import { timingSafeEqual } from "node:crypto";
import { AppError } from "@/core/auth/errors";

export function assertJobRunnerSecret(request: Request) {
  const expected = process.env.JOB_RUNNER_SECRET;
  const received = request.headers.get("x-job-runner-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 24) throw new AppError("JOB_RUNNER_NOT_CONFIGURED", 503, "El ejecutor de trabajos no está configurado.");
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  if (expectedBytes.length !== receivedBytes.length || !timingSafeEqual(expectedBytes, receivedBytes)) throw new AppError("UNAUTHORIZED", 401, "Credencial de worker inválida.");
}
