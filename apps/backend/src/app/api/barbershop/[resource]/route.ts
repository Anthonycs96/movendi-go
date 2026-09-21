import { requireTenantScope, requireSession } from "@/core/auth/session";
import { AppError, errorResponse } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { getSalonHistory, getSalonReports, getCustomerHistory, getSalonCash } from "@/modules/barbershop/server/queries";
import { salonPermission, salonSectionFor, assertSalonModule } from "@/modules/barbershop/server/access";
import { scoped } from "@/modules/barbershop/server/schedule";
import { instant, timezoneFor } from "@/modules/barbershop/server/schedule";

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await context.params;
    const session = await requireSession(salonPermission(resource, "GET"));
    if (session.tenantType !== "BARBERSHOP") throw new AppError("MODULE_ACCESS_DENIED", 403, "Módulo no habilitado.");
    assertSalonModule(session, salonSectionFor(resource));
    const scope = await requireTenantScope(salonPermission(resource, "GET")), query = new URL(request.url).searchParams;
    let data: unknown;
    if (resource === "sales") data = await getSalonHistory(scope, query);
    else if (resource === "reports") data = await getSalonReports(scope, query.get("period"));
    else if (resource === "customers" && query.get("id")) data = await getCustomerHistory(scope, query.get("id")!, query);
    else if (resource === "cash") data = await getSalonCash(scope);
    else if (resource === "appointments") {
      const day = query.get("date"), timezone = await timezoneFor(prisma, scope);
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new AppError("INVALID_DATE", 400, "Selecciona una fecha válida.");
      const startsAt = instant(`${day}T00:00`, timezone);
      const next = new Date(`${day}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
      const endsAt = instant(`${next.toISOString().slice(0, 10)}T00:00`, timezone);
      const rows = await prisma.appointment.findMany({ where: { ...scoped(scope), startsAt: { gte: startsAt, lt: endsAt } }, orderBy: { startsAt: "asc" }, include: { customer: { select: { id: true, name: true, phone: true } }, staff: { select: { id: true, name: true } }, service: { select: { id: true, name: true } }, sale: { select: { id: true } } } });
      data = rows.map((a) => ({ id: a.id, startsAt: a.startsAt, endsAt: a.endsAt, status: a.status, priceCents: a.priceCents, notes: a.notes, customer: a.customer, staff: a.staff, service: a.service, paid: Boolean(a.sale) }));
    }
    else if (resource === "commissions") data = await prisma.salonSaleLine.findMany({ where: { commissionCents: { gt: 0 }, commissionPaidAt: null, salonSale: { ...scoped(scope), sale: { status: "PAID" } } }, take: 500, orderBy: { id: "asc" }, select: { id: true, staffName: true, name: true, commissionCents: true, salonSale: { select: { createdAt: true } } } });
    else throw new AppError("NOT_FOUND", 404, "Consulta no encontrada.");
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
