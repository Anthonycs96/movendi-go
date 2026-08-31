import "server-only";
import { AppError } from "@/core/auth/errors";

const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function detectedMimeType(data: Buffer) {
  if (data.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function validateUploadedDocument(file: File, data: Buffer) {
  const maxMegabytes = Math.max(1, Math.min(50, Number(process.env.DOCUMENT_MAX_MB ?? 10)));
  if (!data.byteLength) throw new AppError("EMPTY_FILE", 400, "El archivo está vacío.");
  if (data.byteLength > maxMegabytes * 1024 * 1024) throw new AppError("FILE_TOO_LARGE", 413, `El archivo supera el máximo de ${maxMegabytes} MB.`);
  const detected = detectedMimeType(data);
  if (!detected || !allowedMimeTypes.has(detected)) throw new AppError("UNSUPPORTED_FILE", 415, "Solo se permiten PDF, JPEG, PNG o WebP válidos.");
  if (file.type && file.type !== "application/octet-stream" && file.type !== detected) throw new AppError("FILE_TYPE_MISMATCH", 415, "El contenido del archivo no coincide con el tipo declarado.");
  return { mimeType: detected, maxMegabytes };
}
