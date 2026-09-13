import { ZodError, type ZodTypeAny, type output } from "zod";
import { AppError } from "@/core/auth/errors";

export function parseInput<TSchema extends ZodTypeAny>(schema: TSchema, body: unknown): output<TSchema> {
  try { return schema.parse(body); }
  catch (error) {
    if (error instanceof ZodError) throw new AppError("VALIDATION_ERROR", 400, error.issues[0]?.message ?? "Datos inválidos.", error.flatten());
    throw error;
  }
}
