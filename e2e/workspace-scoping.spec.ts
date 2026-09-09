import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

async function login(request: APIRequestContext, slug: string) {
  const response = await request.post("/api/auth/login", { data: { email: "superadmin@multisaas.local", password: "Nexo2026!", businessSlug: slug } });
  expect(response.ok()).toBe(true);
}

test("barbería: los datos por pantalla coinciden con el contrato completo", async ({ request }) => {
  await login(request, "nova-studio");
  const full = (await (await request.get("/api/data/tenant")).json()).data;
  for (const [section, fields] of Object.entries({ dashboard: ["customers", "staff", "appointments", "sales", "metrics"], appointments: ["customers", "staff", "services", "appointments", "cashSession"], clients: ["customers"], team: ["staff"], services: ["services"], checkout: ["appointments", "sales", "cashSession"] })) {
    const response = await request.get(`/api/data/tenant?section=${section}`);
    expect(response.ok()).toBe(true);
    const data = (await response.json()).data;
    for (const field of fields) expect(data[field], `${section}/${field}`).toEqual(full[field]);
    if (["clients", "team", "services"].includes(section)) expect(data.appointments).toEqual([]);
  }
});

test("plataforma: cada sección conserva sus datos y descarta colecciones ajenas", async ({ request }) => {
  await login(request, "brasa-norte");
  const full = (await (await request.get("/api/data/platform")).json()).data;
  for (const [section, fields] of Object.entries({ dashboard: ["businesses", "plans", "metrics", "setupTemplates"], businesses: ["businesses", "plans", "setupTemplates"], subscriptions: ["businesses", "plans", "metrics"], plans: ["plans"], users: ["users"], billing: ["billing"], audit: ["audit"], catalog: ["catalog"] })) {
    const response = await request.get(`/api/data/platform?section=${section}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const data = (await response.json()).data;
    for (const field of fields) expect(data[field], `${section}/${field}`).toEqual(full[field]);
    if (section !== "audit") expect(data.audit).toEqual([]);
    if (section !== "billing") expect(data.billing.invoices).toEqual([]);
  }
  expect((await request.get("/api/data/platform?section=invalid")).status()).toBe(400);
});

test("salón y cocina mantienen todas las atenciones activas al omitir el historial cerrado", async ({ request }) => {
  await login(request, "brasa-norte");
  const db = new PrismaClient();
  let paidPendingId: string;
  let closedId: string;
  try {
    const scope = await db.restaurantOrder.findFirstOrThrow({ where: { tenant: { slug: "brasa-norte" } }, select: { tenantId: true, branchId: true, createdById: true } });
    const { tenantId, branchId } = scope;
    const createOrder = (code: string, kitchenStatus: string) => db.restaurantOrder.create({ data: {
      ...scope, code, status: "COMPLETED", source: "TAKEAWAY", totalCents: 1000,
      kitchenTicket: { create: { tenantId, branchId, status: kitchenStatus } },
      sale: { create: { tenantId, branchId, code: `SALE-${code}`, paymentMethod: "CASH", totalCents: 1000 } },
    } });
    closedId = (await createOrder("SCOPE-CLOSED", "SERVED")).id;
    paidPendingId = (await createOrder("SCOPE-PAID-PENDING", "QUEUED")).id;
  } finally {
    await db.$disconnect();
  }
  const full = (await (await request.get("/api/data/tenant")).json()).data;
  expect(full.orders).toEqual(expect.arrayContaining([expect.objectContaining({ id: closedId, paid: true })]));
  for (const section of ["floor", "kitchen"]) {
    const response = await request.get(`/api/data/tenant?section=${section}`);
    expect(response.ok()).toBe(true);
    const data = (await response.json()).data;
    expect(data.orders).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: closedId })]));
    expect(data.orders).toEqual(expect.arrayContaining([expect.objectContaining({ id: paidPendingId, paid: true, status: "COMPLETED" })]));
    expect(data.kitchen).toEqual(expect.arrayContaining([expect.objectContaining({ id: paidPendingId })]));
    expect(data.kitchen).toEqual(full.kitchen);
    const active = full.orders.filter((order: { status: string; kitchenTicket?: { status: string } }) => !["COMPLETED", "CANCELLED"].includes(order.status) || (order.status === "COMPLETED" && order.kitchenTicket && !["SERVED", "CANCELLED"].includes(order.kitchenTicket.status)));
    expect(data.orders).toEqual(active);
  }
});
