import { errorResponse } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { slug } = await context.params;
    const tenant = await prisma.tenant.findFirst({
      where: { slug, status: "ACTIVE", publicSitePublished: true, subscriptionStatus: { in: ["ACTIVE", "TRIAL"] }, plan: { publicWebsiteEnabled: true } },
      include: {
        plan: { select: { publicWebsiteEnabled: true } },
        branches: { where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, address: true, phone: true } },
      },
    });
    if (!tenant) return Response.json({ error: { message: "El sitio no está publicado o el plan no incluye esta función." } }, { status: 404 });
    const branchId = tenant.branches[0]?.id;
    const [services, products, promotions] = await Promise.all([
      tenant.type === "BARBERSHOP" && branchId ? prisma.service.findMany({ where: { tenantId: tenant.id, branchId, active: true }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, category: true, durationMinutes: true, priceCents: true } }) : [],
      tenant.type === "RESTAURANT" && branchId ? prisma.product.findMany({ where: { tenantId: tenant.id, branchId, active: true, category: { active: true } }, orderBy: [{ category: { name: "asc" } }, { name: "asc" }], select: { id: true, name: true, description: true, priceCents: true, category: { select: { name: true } } } }) : [],
      tenant.type === "RESTAURANT" && branchId ? prisma.promotion.findMany({ where: { tenantId: tenant.id, branchId, active: true, OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, name: true, kind: true, value: true, buyQuantity: true, freeQuantity: true, code: true } }) : [],
    ]);
    return Response.json({ site: {
      slug: tenant.slug, name: tenant.name, shortName: tenant.shortName, type: tenant.type, locale: tenant.locale, currency: tenant.currency,
      headline: tenant.publicSiteHeadline || `Bienvenido a ${tenant.shortName}`,
      description: tenant.publicSiteDescription || "Conoce nuestros servicios y comunícate con nosotros.",
      primaryColor: tenant.publicSitePrimaryColor, email: tenant.email, phone: tenant.phone, address: tenant.address,
      whatsapp: tenant.publicSiteWhatsapp, instagram: tenant.publicSiteInstagram, branches: tenant.branches,
      services, products, promotions,
    } });
  } catch (error) {
    return errorResponse(error);
  }
}
