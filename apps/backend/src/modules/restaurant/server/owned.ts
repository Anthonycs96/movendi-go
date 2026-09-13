import { AppError } from "@/core/auth/errors";

export async function required<T>(promise: Promise<T | null>, label: string): Promise<T> {
  const value = await promise;
  if (!value) throw new AppError("NOT_FOUND", 404, `${label} no existe en esta empresa o sucursal.`);
  return value;
}
