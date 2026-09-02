import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession } from "@/core/auth/session";
import { prisma } from "@/core/database/prisma";

type Context = { params: Promise<{ templateId: string }> };

function escapeHtml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireSession("transport:documents:read");
    const { templateId } = await context.params;
    const tripId = new URL(request.url).searchParams.get("tripId");
    if (!tripId) throw new AppError("TRIP_REQUIRED", 400, "Selecciona un viaje.");
    const [template, trip] = await Promise.all([
      prisma.transportDocumentTemplate.findFirst({ where: { id: templateId, tenantId: session.tenantId, active: true } }),
      prisma.transportTrip.findFirst({ where: { id: tripId, tenantId: session.tenantId, branchId: session.branchId }, include: { customer: true, route: { include: { origin: true, destination: true } }, customFieldValues: { include: { definition: true } } } }),
    ]);
    if (!template) throw new AppError("TEMPLATE_NOT_FOUND", 404, "La plantilla no existe.");
    if (!trip) throw new AppError("TRIP_NOT_FOUND", 404, "El viaje no existe.");
    if (template.scopeType === "CUSTOMER" && template.scopeId !== trip.customerId || template.scopeType === "OPERATION" && template.scopeId !== trip.operationId) throw new AppError("TEMPLATE_SCOPE_MISMATCH", 409, "La plantilla no aplica a este viaje.");
    const values: Record<string, string> = { "trip.code": trip.code, "trip.status": trip.status, "trip.scheduledStartAt": trip.scheduledStartAt.toISOString(), "trip.scheduledEndAt": trip.scheduledEndAt.toISOString(), "customer.name": trip.customer.legalName, "customer.document": trip.customer.documentNo, "route.name": trip.route.name, "route.origin": trip.route.origin.name, "route.destination": trip.route.destination.name };
    for (const field of trip.customFieldValues) values[`field.${field.definition.code}`] = field.textValue ?? String(field.numberValue ?? field.booleanValue ?? field.dateValue?.toISOString() ?? "");
    const rendered = template.content.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(template.name)} · ${escapeHtml(trip.code)}</title><style>body{font:14px Arial,sans-serif;margin:40px;color:#172033}pre{white-space:pre-wrap;line-height:1.5}@media print{body{margin:18mm}}</style></head><body><pre>${escapeHtml(rendered)}</pre></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${template.code}-${trip.code}.html"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
