import "server-only";
import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";

export type PrintLine = { productId: string; parentProductId?: string | null; name: string; quantity: number; notes: string | null };

type PrintEvent = {
  orderId: string;
  type: "INITIAL" | "ADDITION" | "CANCELLATION";
  lines: PrintLine[];
  orderNotes?: string | null;
};

type Target = {
  printerId: string | null;
  printerName: string;
  automatic: boolean;
  copies: number;
  sections: Map<string, { areaId: string | null; areaName: string; items: PrintLine[] }>;
};

export async function createRoutedPrintJobs(transaction: Prisma.TransactionClient, scope: TenantScope, event: PrintEvent) {
  if (event.type === "CANCELLATION") {
    const previous = await transaction.restaurantPrintJob.findMany({
      where: { orderId: event.orderId, type: { in: ["INITIAL", "ADDITION"] } },
      select: { printerId: true, preparationAreaId: true, printer: { select: { name: true, automatic: true } }, preparationArea: { select: { name: true } }, copies: true },
      distinct: ["printerId"],
    });
    const targets = previous.length ? previous : [{ printerId: null, preparationAreaId: null, printer: null, preparationArea: null, copies: 1 }];
    await transaction.restaurantPrintJob.createMany({
      data: targets.map((target) => ({
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        orderId: event.orderId,
        createdById: scope.actorId,
        preparationAreaId: target.preparationAreaId,
        printerId: target.printerId,
        type: event.type,
        copies: target.copies,
        automatic: target.printer?.automatic ?? true,
        payload: JSON.stringify({ printerName: target.printer?.name ?? "Impresora principal", sections: [], items: [], orderNotes: event.orderNotes ?? "PEDIDO ANULADO" }),
      })),
    });
    return targets.length;
  }

  const [settings, products] = await Promise.all([
    transaction.restaurantPrintSettings.findUnique({
      where: { branchId: scope.branchId },
      include: { defaultPrinter: { select: { id: true, name: true, active: true, automatic: true } } },
    }),
    transaction.product.findMany({
      where: { tenantId: scope.tenantId, branchId: scope.branchId, id: { in: [...new Set(event.lines.flatMap((line) => [line.productId, ...(line.parentProductId ? [line.parentProductId] : [])]))] } },
      select: {
        id: true,
        productType: true,
        areaAssignmentMode: true,
        preparationArea: { select: { id: true, name: true, active: true, dispatchMode: true, printerLinks: { where: { active: true, printer: { active: true } }, select: { copies: true, printer: { select: { id: true, name: true, automatic: true } } } } } },
        category: { select: { preparationArea: { select: { id: true, name: true, active: true, dispatchMode: true, printerLinks: { where: { active: true, printer: { active: true } }, select: { copies: true, printer: { select: { id: true, name: true, automatic: true } } } } } } } },
      },
    }),
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));
  const targets = new Map<string, Target>();
  const addTarget = (line: PrintLine, area: { id: string; name: string } | null, printer: { id: string; name: string; automatic: boolean } | null, copies: number) => {
    const key = printer?.id ?? "UNASSIGNED";
    const target = targets.get(key) ?? { printerId: printer?.id ?? null, printerName: printer?.name ?? "Impresora principal", automatic: (settings?.automatic ?? true) && (printer?.automatic ?? true), copies, sections: new Map() };
    target.copies = Math.max(target.copies, copies);
    const areaKey = area?.id ?? "GENERAL";
    const section = target.sections.get(areaKey) ?? { areaId: area?.id ?? null, areaName: area?.name ?? "General", items: [] };
    section.items.push(line);
    target.sections.set(areaKey, section);
    targets.set(key, target);
  };

  for (const line of event.lines) {
    const product = productById.get(line.productId);
    const parentProduct = line.parentProductId ? productById.get(line.parentProductId) : null;
    const inheritedArea = parentProduct?.preparationArea ?? parentProduct?.category.preparationArea ?? null;
    const configuredArea = product?.productType === "ADDON" && product.areaAssignmentMode === "INHERIT_FROM_PRODUCT" ? inheritedArea : product?.preparationArea ?? product?.category.preparationArea ?? null;
    const area = settings?.mode === "ADVANCED" ? configuredArea : null;
    if (settings?.mode === "ADVANCED" && area && area.dispatchMode !== "PRINTER") continue;
    const links = area?.active ? area.printerLinks : [];
    if (settings?.mode === "ADVANCED" && links.length) {
      for (const link of links) addTarget(line, area, link.printer, link.copies);
    } else {
      const fallback = settings?.defaultPrinter?.active ? settings.defaultPrinter : null;
      addTarget(line, area, fallback, 1);
    }
  }

  if (!targets.size) return 0;
  await transaction.restaurantPrintJob.createMany({
    data: [...targets.values()].map((target) => {
      const sections = [...target.sections.values()];
      return {
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        orderId: event.orderId,
        createdById: scope.actorId,
        preparationAreaId: sections.length === 1 ? sections[0].areaId : null,
        printerId: target.printerId,
        type: event.type,
        copies: target.copies,
        automatic: target.automatic,
        payload: JSON.stringify({ printerName: target.printerName, fields: JSON.parse(settings?.fields ?? "[]"), sections, items: sections.flatMap((section) => section.items), orderNotes: event.orderNotes ?? null }),
      };
    }),
  });
  return targets.size;
}
