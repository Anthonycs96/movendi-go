import { getMistralKey, mistralStatus } from "@/core/platform/mistral";
import { menuChange, recordMenuHistory, type MenuChange } from "@/modules/restaurant/server/menu-history";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { requireSession } from "@/core/auth/session";
import { AppError, errorResponse } from "@/core/auth/errors";
import { assertTenantWriteEntitlement } from "@/core/platform/entitlements";
import { assertRestaurantModule } from "@/modules/restaurant/server/access";
import { withInventoryTransaction } from "@/modules/inventory/server/service";
import { extractedMenuRow, extractMenuPage } from "@/modules/restaurant/server/menu-extraction";
import { getRestaurantConfiguration } from "@/modules/restaurant/server/configuration";

export const runtime = "nodejs";
export const maxDuration = 90;
const startSchema = z.object({ filename: z.string().min(1).max(180), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), pageCount: z.number().int().min(1).max(50) });
const rowSchema = z.object({ name: z.string().trim().min(2).max(140), category: z.string().trim().min(2).max(100), description: z.string().max(400), price: z.number().positive().max(100000), cost: z.number().nonnegative().max(100000).default(0), kind: z.enum(["PRODUCT", "ADDON", "COMBO"]), targetId: z.string().optional(), expectedPriceCents: z.number().int().optional(), active: z.boolean() });
const commitSchema = z.object({ id: z.string(), confirmed: z.literal(true), areaId: z.string().min(1), taxCategory: z.enum(["GRAVADA", "EXONERADA", "INAFECTA"]), rows: z.array(rowSchema).min(1).max(500) });
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es");
async function scope() {
  const session = await requireSession("restaurant:menu:write");
  if (session.tenantType !== "RESTAURANT") throw new AppError("FORBIDDEN", 403, "Solo disponible para restaurantes.");
  assertRestaurantModule(session, "menu");
  return { tenantId: session.tenantId, branchId: session.branchId, actorId: session.userId };
}
export async function GET() {
  try {
    const current = await scope();
    const jobs = await prisma.restaurantMenuImport.findMany({ where: { tenantId: current.tenantId, branchId: current.branchId, status: { not: "APPLIED" } }, orderBy: { createdAt: "desc" }, take: 50 });
    return Response.json({ enabled: (await mistralStatus()).configured, jobs: jobs.map((job) => ({ ...job, rows: JSON.parse(job.rows) })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const current = await scope();
    await assertTenantWriteEntitlement(current.tenantId);
    const mistralKey = await getMistralKey();
    if (request.headers.get("content-type")?.includes("application/json")) {
      const input = startSchema.parse(await request.json());
      const job = await withInventoryTransaction(async (tx) => {
        const existing = await tx.restaurantMenuImport.findFirst({ where: { tenantId: current.tenantId, branchId: current.branchId, sourceHash: input.sourceHash, status: { not: "APPLIED" } }, orderBy: { createdAt: "desc" } });
        if (existing) return existing;
        if (!mistralKey) throw new AppError("IMPORT_PROVIDER_NOT_CONFIGURED", 503, "La lectura PDF necesita que el administrador configure el proveedor de IA.");
        const month = new Date(); month.setUTCDate(1); month.setUTCHours(0,0,0,0);
        const used = await tx.restaurantMenuImport.aggregate({ where: { tenantId: current.tenantId, createdAt: { gte: month } }, _sum: { pageCount: true } });
        const quota = Number(process.env.MENU_IMPORT_MONTHLY_PAGES ?? 50);
        if ((used._sum.pageCount ?? 0) + input.pageCount > quota) throw new AppError("IMPORT_QUOTA", 409, "La carta supera las páginas disponibles este mes. Solicita una ampliación al administrador.");
        return tx.restaurantMenuImport.create({ data: { ...current, ...input } });
      });
      return Response.json({ ...job, rows: JSON.parse(job.rows) });
    }
    if (!mistralKey) throw new AppError("IMPORT_PROVIDER_NOT_CONFIGURED", 503, "La lectura PDF necesita que el administrador configure el proveedor de IA.");
    if (Number(request.headers.get("content-length") ?? 0) > 9 * 1024 * 1024) throw new AppError("FILE_TOO_LARGE", 413, "Cada página debe ocupar menos de 8 MB.");
    const form = await request.formData();
    const id = String(form.get("id") ?? ""), page = Number(form.get("page"));
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024 || !Number.isInteger(page)) throw new AppError("INVALID_FILE", 400, "Envía una página PDF de hasta 8 MB.");
    const job = await prisma.restaurantMenuImport.findFirst({ where: { id, tenantId: current.tenantId, branchId: current.branchId } });
    if (!job) throw new AppError("NOT_FOUND", 404, "Importación no encontrada.");
    if (page < job.nextPage) return Response.json({ ...job, rows: JSON.parse(job.rows) });
    if (job.status === "APPLIED" || page !== job.nextPage || page >= job.pageCount || job.attempts >= 3) throw new AppError("IMPORT_STATE", 409, "La página no está pendiente o agotó sus tres intentos. Revisa la importación.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (Buffer.from(bytes.subarray(0,5)).toString() !== "%PDF-") throw new AppError("INVALID_FILE", 400, "El archivo no es un PDF.");
    const document = await PDFDocument.load(bytes);
    if (document.getPageCount() !== 1) throw new AppError("INVALID_FILE", 400, "Procesa una sola página a la vez.");
    const leaseUntil = new Date(Date.now() + 90_000);
    const claimed = await prisma.restaurantMenuImport.updateMany({ where: { id, nextPage: page, attempts: { lt: 3 }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] }, data: { status: "READING", leaseUntil, attempts: { increment: 1 }, lastError: null } });
    if (!claimed.count) throw new AppError("IMPORT_BUSY", 409, "Esta página ya se está leyendo. Espera antes de reintentar.");
    try {
      const products = await extractMenuPage(bytes, mistralKey);
      const rows = [...JSON.parse(job.rows), ...products.map((row, index) => ({ ...row, page: page + 1, key: `${page}-${index}` }))];
      if (rows.length > 500) throw new Error("La carta supera el máximo de 500 productos por importación.");
      const updated = await prisma.restaurantMenuImport.updateMany({ where: { id, nextPage: page, leaseUntil }, data: { rows: JSON.stringify(rows), nextPage: page + 1, attempts: 0, leaseUntil: null, status: page + 1 === job.pageCount ? "REVIEW" : "DRAFT" } });
      if (!updated.count) throw new Error("La lectura cambió. Actualiza la importación.");
      return Response.json({ ...job, rows, nextPage: page + 1, status: page + 1 === job.pageCount ? "REVIEW" : "DRAFT" });
    } catch (error) {
      const message = error instanceof Error && !(error instanceof z.ZodError) && !error.message.includes("JSON") ? error.message.slice(0,250) : "No se pudo interpretar la respuesta. Revisa o reintenta la página.";
      await prisma.restaurantMenuImport.updateMany({ where: { id, leaseUntil }, data: { status: "PAUSED", leaseUntil: null, lastError: message } });
      throw new AppError("IMPORT_READ_FAILED", 502, message);
    }
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const current = await scope(); await assertTenantWriteEntitlement(current.tenantId);
    const input = commitSchema.parse(await request.json());
    const config = await getRestaurantConfiguration(current.tenantId, current.branchId);
    const result = await withInventoryTransaction(async (tx) => {
      const job = await tx.restaurantMenuImport.findFirst({ where: { id: input.id, tenantId: current.tenantId, branchId: current.branchId } });
      if (!job) throw new AppError("NOT_FOUND", 404, "Importación no encontrada.");
      if (job.status === "APPLIED") return { ok: true, message: "La importación ya fue aplicada; no se duplicaron productos." };
      if (job.status !== "REVIEW" || job.nextPage !== job.pageCount) throw new AppError("IMPORT_NOT_READY", 409, "Termina la lectura antes de confirmar.");
      if (!job.sourceVerified) throw new AppError("SOURCE_REQUIRED", 409, "Selecciona el PDF original para conservarlo antes de aplicar los cambios.");
      const area = await tx.preparationArea.findFirst({ where: { id: input.areaId, tenantId: current.tenantId, branchId: current.branchId, active: true } });
      if (!area) throw new AppError("INVALID_AREA", 400, "Selecciona un área activa de esta sede.");
      const categories = await tx.category.findMany({ where: { tenantId: current.tenantId, branchId: current.branchId } });
      const products = await tx.product.findMany({ where: { tenantId: current.tenantId, branchId: current.branchId } });
      const changes: MenuChange[] = [];
      const names = new Set<string>(), targets = new Set<string>();
      for (const row of input.rows) {
        if (names.has(normalize(row.name)) || (row.targetId && targets.has(row.targetId))) throw new AppError("DUPLICATE_PRODUCT", 400, "La selección contiene productos repetidos. Conserva una fila por producto.");
        names.add(normalize(row.name)); if (row.targetId) targets.add(row.targetId);
        const existing = row.targetId ? products.find((product) => product.id === row.targetId) : null;
        if (row.targetId && !existing) throw new AppError("PRODUCT_NOT_FOUND", 404, "El producto a actualizar no pertenece a esta sede.");
        if (products.some((product) => normalize(product.name) === normalize(row.name) && product.id !== existing?.id)) throw new AppError("DUPLICATE_PRODUCT", 409, `Ya existe ${row.name}. Elige actualizarlo o cambia el nombre.`);
        if (existing) {
          if (row.expectedPriceCents !== existing.priceCents) throw new AppError("PRODUCT_CHANGED", 409, `El precio de ${existing.name} cambió. Actualiza la carta antes de importar.`);
          // Updating a price never resets recipes, taxes, category, stock or preparation routing.
          const updated = await tx.product.update({ where: { id: existing.id }, data: { name: row.name, description: row.description, priceCents: Math.round(row.price * 100) } });
          changes.push(menuChange(existing, updated));
        } else {
          const kind = row.kind === "ADDON" ? "ADDON" : "FOOD";
          if (!config.menu.productTypes.some((type) => type.key === kind && type.active) || (kind === "ADDON" && !config.menu.addonsEnabled)) throw new AppError("PRODUCT_TYPE_DISABLED", 409, "El tipo de producto no está habilitado en la carta.");
          if (row.active && config.menu.requireCost && row.cost <= 0) throw new AppError("PRODUCT_COST_REQUIRED", 400, `Registra el costo de ${row.name} o impórtalo inactivo.`);
          if (row.kind === "COMBO" && row.active) throw new AppError("COMBO_REVIEW", 400, "Importa los combos inactivos y configura su composición antes de venderlos.");
          let category = categories.find((item) => normalize(item.name) === normalize(row.category));
          if (category && !category.active) throw new AppError("CATEGORY_INACTIVE", 409, `La categoría ${category.name} está inactiva.`);
          if (!category) { category = await tx.category.create({ data: { tenantId: current.tenantId, branchId: current.branchId, name: row.category, preparationAreaId: area.id } }); categories.push(category); }
          const created = await tx.product.create({ data: { tenantId: current.tenantId, branchId: current.branchId, categoryId: category.id, preparationAreaId: area.id, kitchenArea: area.name, name: row.name, description: row.description, priceCents: Math.round(row.price * 100), costCents: Math.round(row.cost * 100), productType: kind, taxCategory: input.taxCategory, active: row.active } });
          changes.push(menuChange(null, created));
        }
      }
      await tx.restaurantMenuImport.update({ where: { id: job.id }, data: { status: "APPLIED", rows: JSON.stringify(input.rows) } });
      await recordMenuHistory(tx, current, { version: 1, source: "PDF", importId: job.id, filename: job.filename, changes });
      return { ok: true, message: `${input.rows.length} productos importados. Los productos no seleccionados se conservaron.` };
    });
    return Response.json(result);
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const current = await scope(); await assertTenantWriteEntitlement(current.tenantId);
    const body = await request.json();
    if (body.action === "skip") {
      const input = z.object({ id: z.string(), page: z.number().int().min(0).max(49), confirmed: z.literal(true) }).parse(body);
      await withInventoryTransaction(async (tx) => {
        const job = await tx.restaurantMenuImport.findFirst({ where: { id: input.id, tenantId: current.tenantId, branchId: current.branchId, nextPage: input.page, status: { notIn: ["APPLIED", "REVIEW"] }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] } });
        if (!job || job.nextPage >= job.pageCount) throw new AppError("IMPORT_BUSY", 409, "Espera a que termine la página antes de omitirla.");
        await tx.restaurantMenuImport.update({ where: { id: job.id }, data: { nextPage: job.nextPage + 1, attempts: 0, leaseUntil: null, status: job.nextPage + 1 === job.pageCount ? "REVIEW" : "DRAFT" } });
        await tx.auditLog.create({ data: { tenantId: current.tenantId, branchId: current.branchId, userId: current.actorId, action: "SKIP_MENU_PAGE", entityType: "RestaurantMenuImport", entityId: job.id, metadata: JSON.stringify({ page: input.page + 1 }) } });
      });
      return Response.json({ ok: true, message: "Página omitida. No se importarán productos de esa página." });
    }
    const draftSchema = z.object({ id: z.string(), rows: z.array(extractedMenuRow.extend({ key: z.string().max(30), page: z.number().int().min(1).max(50), cost: z.number().nonnegative().optional(), selected: z.boolean().optional(), active: z.boolean().optional(), targetId: z.string().optional(), expectedPriceCents: z.number().int().optional() })).max(500) });
    const input = draftSchema.parse(body);
    const result = await prisma.restaurantMenuImport.updateMany({ where: { id: input.id, tenantId: current.tenantId, branchId: current.branchId, status: "REVIEW" }, data: { rows: JSON.stringify(input.rows) } });
    if (!result.count) throw new AppError("IMPORT_NOT_EDITABLE", 409, "Este borrador ya no está disponible para edición.");
    return Response.json({ ok: true, message: "Revisión guardada. Puedes continuar después." });
  } catch (error) { return errorResponse(error); }
}
