import "server-only";
import { createConnection } from "node:net";
import { AppError } from "@/core/auth/errors";

export type ScanStatus = "CLEAN" | "SKIPPED";

function clamAvScan(data: Buffer) {
  const host = process.env.CLAMAV_HOST?.trim();
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  if (!host) throw new Error("CLAMAV_HOST no está configurado.");
  return new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port });
    const chunks: Buffer[] = [];
    const fail = (error: Error) => { socket.destroy(); reject(error); };
    socket.setTimeout(Math.max(1_000, Number(process.env.CLAMAV_TIMEOUT_MS ?? 15_000)), () => fail(new Error("El análisis antivirus excedió el tiempo permitido.")));
    socket.once("error", fail);
    socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    socket.once("end", () => {
      const response = Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim();
      if (response.endsWith("OK")) resolve();
      else if (response.includes("FOUND")) reject(new AppError("MALWARE_DETECTED", 422, "El archivo fue rechazado por el análisis antivirus."));
      else reject(new Error(`Respuesta antivirus no reconocida: ${response || "vacía"}`));
    });
    socket.once("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0"));
      for (let offset = 0; offset < data.length; offset += 64 * 1024) {
        const chunk = data.subarray(offset, Math.min(offset + 64 * 1024, data.length));
        const length = Buffer.allocUnsafe(4); length.writeUInt32BE(chunk.length); socket.write(length); socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });
  });
}

export async function scanUploadedFile(data: Buffer): Promise<ScanStatus> {
  const mode = process.env.ANTIVIRUS_MODE?.trim().toLowerCase() || "disabled";
  if (mode === "disabled") {
    if (process.env.REQUIRE_ANTIVIRUS === "true") throw new AppError("ANTIVIRUS_REQUIRED", 503, "El análisis antivirus es obligatorio y no está configurado.");
    return "SKIPPED";
  }
  if (mode !== "clamav") throw new Error("ANTIVIRUS_MODE debe ser disabled o clamav.");
  try { await clamAvScan(data); return "CLEAN"; }
  catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("ANTIVIRUS_UNAVAILABLE", 503, "El servicio antivirus no está disponible. Intenta nuevamente.");
  }
}
