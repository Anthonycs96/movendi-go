import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";

export function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa los datos ingresados.", result.error.flatten());
  return result.data;
}

export async function owned<T extends { id: string }>(promise: Promise<T | null>, label: string): Promise<T> {
  const value = await promise;
  if (!value) throw new AppError("NOT_FOUND", 404, `${label} no existe en esta empresa.`);
  return value;
}

export function assertRange(startsAt: Date, endsAt: Date, future = false) {
  if (endsAt <= startsAt) throw new AppError("INVALID_DATE_RANGE", 400, "La fecha de fin debe ser posterior al inicio.");
  if (future && startsAt < new Date(Date.now() - 60_000)) throw new AppError("DATE_IN_PAST", 400, "La programación no puede iniciar en el pasado.");
}

export async function assertDocumentValid(tenantId: string, ownerType: string, ownerId: string, at: Date) {
  const expired = await prisma.transportDocument.findFirst({ where: { tenantId, ownerType, ownerId, status: { not: "CANCELLED" }, expiresAt: { lt: at } }, select: { type: true } });
  if (expired) throw new AppError("DOCUMENT_EXPIRED", 409, `${expired.type} está vencido para la fecha programada.`);
}

export const tripTransitions: Record<string, string[]> = {
  DRAFT: ["PLANNED", "CANCELLED"],
  PLANNED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["IN_TRANSIT", "PLANNED", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};
