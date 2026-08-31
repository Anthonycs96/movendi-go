import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const marker = `print-claim-validation-${Date.now()}`;
const rollbackSignal = "PRINT_CLAIM_VALIDATION_ROLLBACK";
let validated = false;

try {
  await prisma.$transaction(async (transaction) => {
    const order = await transaction.restaurantOrder.findFirst({
      select: { id: true, tenantId: true, branchId: true, createdById: true },
    });
    if (!order) throw new Error("No existe un pedido de restaurante para realizar la validación.");

    const job = await transaction.restaurantPrintJob.create({
      data: {
        tenantId: order.tenantId,
        branchId: order.branchId,
        orderId: order.id,
        createdById: order.createdById,
        type: "INITIAL",
        payload: marker,
      },
    });
    const now = new Date();
    const lease = new Date(now.getTime() + 10 * 60 * 1000);

    const firstClaim = await transaction.restaurantPrintJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "PROCESSING", stationId: "station-validation-a", claimedAt: now, leaseExpiresAt: lease, attempts: { increment: 1 } },
    });
    const duplicateClaim = await transaction.restaurantPrintJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "PROCESSING", stationId: "station-validation-b" },
    });
    if (firstClaim.count !== 1 || duplicateClaim.count !== 0) throw new Error("La reserva atómica no evitó la duplicación.");

    await transaction.restaurantPrintJob.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(now.getTime() - 1) } });
    const recoveryClaim = await transaction.restaurantPrintJob.updateMany({
      where: { id: job.id, status: "PROCESSING", leaseExpiresAt: { lte: new Date() } },
      data: { stationId: "station-validation-b", claimedAt: new Date(), leaseExpiresAt: lease, attempts: { increment: 1 } },
    });
    const wrongStationAck = await transaction.restaurantPrintJob.updateMany({
      where: { id: job.id, status: "PROCESSING", stationId: "station-validation-a" },
      data: { status: "PRINTED" },
    });
    const ownerAck = await transaction.restaurantPrintJob.updateMany({
      where: { id: job.id, status: "PROCESSING", stationId: "station-validation-b" },
      data: { status: "PRINTED", printedAt: new Date(), leaseExpiresAt: null },
    });
    if (recoveryClaim.count !== 1 || wrongStationAck.count !== 0 || ownerAck.count !== 1) throw new Error("La recuperación o confirmación de estación no es segura.");

    validated = true;
    throw new Error(rollbackSignal);
  }, { timeout: 20_000 });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackSignal) throw error;
} finally {
  const persisted = await prisma.restaurantPrintJob.count({ where: { payload: marker } });
  console.log(JSON.stringify({ atomicClaim: validated, rollbackClean: persisted === 0 }));
  await prisma.$disconnect();
}

