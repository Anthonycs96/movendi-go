import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { hasPermission } from "@/core/auth/permissions";
import { prisma } from "@/core/database/prisma";
import { auditRetail, scoped } from "./service";
import { withSerializableTransaction } from "@/core/database/transactions";

export const qrMethod = z.enum(["YAPE", "PLIN", "TRANSFER", "OTHER"]);
export async function savePaymentQr(scope: TenantScope, method: string, payee: string, file: Uint8Array | null) {
  if (!hasPermission(scope.permissions, "settings:write")) throw new AppError("FORBIDDEN", 403, "Solo un administrador puede configurar los QR de cobro.");
  const selected = qrMethod.parse(method);
  let imageBase64 = "";
  if (file) {
    payee = z.string().trim().min(2).max(120).parse(payee);
    if (!file.length || file.length > 2 * 1024 * 1024) throw new AppError("INVALID_QR_IMAGE", 400, "Sube una imagen PNG, JPG o WebP de hasta 2 MB.");
    try {
      const source = sharp(file, { limitInputPixels: 16_000_000, animated: false });
      const meta = await source.metadata();
      if (!["png", "jpeg", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) > 1) throw new Error("format");
      const image = await source.rotate().resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true }).flatten({ background: "white" }).png().toBuffer();
      if (image.length > 1024 * 1024) throw new Error("size");
      imageBase64 = image.toString("base64");
    } catch { throw new AppError("INVALID_QR_IMAGE", 400, "La imagen no es válida. Usa un PNG, JPG o WebP nítido de tu QR."); }
  }
  return withSerializableTransaction(async (tx) => {
    const branch = await tx.branch.findFirst({ where: { id: scope.branchId, tenantId: scope.tenantId, active: true } });
    if (!branch) throw new AppError("NOT_FOUND", 404, "Sucursal no encontrada.");
    if (!file) {
      await tx.retailPaymentQr.deleteMany({ where: { ...scoped(scope), method: selected } });
      await auditRetail(tx, scope, "PAYMENT_QR_REMOVE", scope.branchId, { method: selected });
      return { removed: true };
    }
    const result = await tx.retailPaymentQr.upsert({ where: { branchId_method: { branchId: scope.branchId, method: selected } }, create: { ...scoped(scope), method: selected, payee, imageBase64 }, update: { payee, imageBase64 } });
    await auditRetail(tx, scope, "PAYMENT_QR_SAVE", result.id, { method: selected, payee });
    return { id: result.id };
  });
}
export async function paymentQrList(scope: TenantScope) {
  return prisma.retailPaymentQr.findMany({ where: scoped(scope), select: { id: true, method: true, payee: true, updatedAt: true }, orderBy: { method: "asc" } });
}
