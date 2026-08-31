import { prisma } from "../apps/backend/src/core/database/prisma";
import { createRoutedPrintJobs } from "../apps/backend/src/modules/restaurant/server/printing";

const marker = `routing-validation-${Date.now()}`;
const rollbackSignal = "PRINT_ROUTING_VALIDATION_ROLLBACK";
let result: Record<string, unknown> = {};

async function main() {
 try {
  await prisma.$transaction(async (transaction) => {
    const order = await transaction.restaurantOrder.findFirst({ select: { id: true, tenantId: true, branchId: true, createdById: true } });
    if (!order) throw new Error("No existe un pedido para validar el enrutamiento.");
    const category = await transaction.category.findFirst({ where: { tenantId: order.tenantId, branchId: order.branchId }, select: { id: true } });
    if (!category) throw new Error("No existe una categoría para validar el enrutamiento.");

    const [kitchen, grill, bar] = await Promise.all([
      transaction.preparationArea.create({ data: { tenantId: order.tenantId, branchId: order.branchId, name: `${marker}-cocina` } }),
      transaction.preparationArea.create({ data: { tenantId: order.tenantId, branchId: order.branchId, name: `${marker}-parrilla` } }),
      transaction.preparationArea.create({ data: { tenantId: order.tenantId, branchId: order.branchId, name: `${marker}-bar` } }),
    ]);
    const [sharedPrinter, barPrinter] = await Promise.all([
      transaction.printDevice.create({ data: { tenantId: order.tenantId, branchId: order.branchId, name: `${marker}-compartida` } }),
      transaction.printDevice.create({ data: { tenantId: order.tenantId, branchId: order.branchId, name: `${marker}-bar-printer` } }),
    ]);
    await transaction.preparationAreaPrinter.createMany({ data: [
      { tenantId: order.tenantId, branchId: order.branchId, areaId: kitchen.id, printerId: sharedPrinter.id, copies: 1 },
      { tenantId: order.tenantId, branchId: order.branchId, areaId: grill.id, printerId: sharedPrinter.id, copies: 2 },
      { tenantId: order.tenantId, branchId: order.branchId, areaId: bar.id, printerId: barPrinter.id, copies: 1 },
    ] });
    await transaction.restaurantPrintSettings.upsert({ where: { branchId: order.branchId }, create: { tenantId: order.tenantId, branchId: order.branchId, mode: "ADVANCED", automatic: true, defaultPrinterId: sharedPrinter.id }, update: { mode: "ADVANCED", automatic: true, defaultPrinterId: sharedPrinter.id } });
    const products = await Promise.all([kitchen, grill, bar].map((area, index) => transaction.product.create({ data: { tenantId: order.tenantId, branchId: order.branchId, categoryId: category.id, name: `${marker}-producto-${index}`, priceCents: 1000, preparationAreaId: area.id } })));
    const scope = { tenantId: order.tenantId, branchId: order.branchId, actorId: order.createdById, tenantType: "RESTAURANT", permissions: ["*"] };
    await createRoutedPrintJobs(transaction, scope, { orderId: order.id, type: "ADDITION", lines: products.map((product, index) => ({ productId: product.id, name: product.name, quantity: index + 1, notes: null })) });
    const jobs = await transaction.restaurantPrintJob.findMany({ where: { orderId: order.id, type: "ADDITION", payload: { contains: marker } }, orderBy: { printerId: "asc" } });
    const shared = jobs.find((job) => job.printerId === sharedPrinter.id);
    const separate = jobs.find((job) => job.printerId === barPrinter.id);
    const sharedPayload = shared ? JSON.parse(shared.payload) as { sections?: unknown[] } : null;
    if (jobs.length !== 2 || shared?.copies !== 2 || sharedPayload?.sections?.length !== 2 || separate?.copies !== 1) throw new Error("El reparto no agrupó correctamente las áreas por impresora.");
    result = { generatedJobs: jobs.length, sharedPrinterSections: sharedPayload.sections.length, sharedPrinterCopies: shared.copies, separatePrinterCopies: separate.copies, duplicateJobs: 0 };
    throw new Error(rollbackSignal);
  }, { timeout: 30_000 });
 } catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackSignal) throw error;
 } finally {
  const persisted = await prisma.preparationArea.count({ where: { name: { startsWith: marker } } });
  console.log(JSON.stringify({ ...result, rollbackClean: persisted === 0 }));
  await prisma.$disconnect();
 }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falló la validación de enrutamiento.");
  process.exitCode = 1;
});
