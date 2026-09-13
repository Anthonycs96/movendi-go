import "server-only";
import { Prisma } from "@prisma/client";
import { AppError } from "@/core/auth/errors";
import { prisma } from "./prisma";

/** Adapters translate optimistic conflicts into this infrastructure signal. */
export class TransactionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionConflictError";
  }
}

export async function withSerializableTransaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    } catch (error) {
      const retriable = error instanceof TransactionConflictError
        || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034");
      if (!retriable) throw error;
      // These callers already expose this legacy code/message. Relocating the
      // runner must not silently change authentication, fiscal or cash APIs.
      if (attempt === 2) throw new AppError("INVENTORY_BUSY", 409, "El inventario cambió durante la operación. Inténtalo nuevamente.");
    }
  }
}
