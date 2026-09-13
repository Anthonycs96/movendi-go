import { expect, test } from "@playwright/test";
import type { BarbershopData } from "../apps/backend/src/modules/barbershop/types";
import { mkdir } from "node:fs/promises";

test("Barbería cobra desde agenda, separa efectivo y pagos digitales y protege caja cerrada", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { email: "admin@nova.local", businessSlug: "nova-studio", password: "Nexo2026!", rememberSession: false } });
  expect(login.status(), await login.text()).toBe(200);
  if ((await login.json()).redirectTo.startsWith("/change-password")) {
    const changed = await page.request.post("/api/auth/change-password", { data: { currentPassword: "Nexo2026!", newPassword: "Nexo2026!-sales" } });
    expect(changed.status(), await changed.text()).toBe(200);
  }
  const data = async () => {
    const response = await page.request.get("/api/data/tenant");
    expect(response.status(), await response.text()).toBe(200);
    return (await response.json()).data as BarbershopData;
  };
  const before = await data();
  expect(before.cashSession).not.toBeNull();
  const name = `Cliente ventas ${Date.now()}`;
  const customer = await page.request.post("/api/operations/barbershop/customers", { data: { name } });
  expect(customer.status(), await customer.text()).toBe(200);
  const customerId = (await customer.json()).id as string;
  const createAppointment = async (startsAt: string) => {
    const response = await page.request.post("/api/operations/barbershop/appointments", { data: { customerId, staffId: "staff-mateo", serviceId: "service-cut", startsAt } });
    expect(response.status(), await response.text()).toBe(200);
    return (await response.json()).id as string;
  };
  const id = await createAppointment("2035-01-08T14:00");
  await page.goto("/t/nova-studio/appointments");
  await page.getByPlaceholder("Buscar cliente, servicio o barbero").fill(name);
  await page.getByLabel("Filtrar por fecha").fill("");
  const row = page.getByRole("row").filter({ hasText: name });
  const checkoutResponse = page.waitForResponse((response) => response.url().endsWith(`/appointments/${id}/checkout`) && response.request().method() === "POST");
  await row.getByRole("button", { name: "Cobrar", exact: true }).click();
  await page.getByRole("dialog", { name: "Cobrar cita" }).getByLabel("Medio de pago").selectOption("YAPE");
  await mkdir("output/stages678", { recursive: true });
  await page.getByRole("dialog", { name: "Cobrar cita" }).screenshot({ path: "output/stages678/barber-payment.png" });
  await page.getByRole("dialog", { name: "Cobrar cita" }).getByRole("button", { name: "Registrar cobro" }).click();
  const checkout = await checkoutResponse;
  expect(checkout.status(), await checkout.text()).toBe(200);
  const saleId = (await checkout.json()).id as string;
  await expect(row.getByRole("button", { name: "Cobrar", exact: true })).toHaveCount(0);
  const after = await data();
  const sale = after.sales.find((entry) => entry.id === saleId)!;
  expect(sale.paymentMethod).toBe("YAPE");
  expect(sale.totalCents).toBe(before.services.find((entry) => entry.id === "service-cut")!.priceCents);
  expect(after.cashSession!.expectedCents).toBe(before.cashSession!.expectedCents);
  expect(after.appointments.find((entry) => entry.id === id)?.status).toBe("COMPLETED");
  const repeat = await page.request.post(`/api/operations/barbershop/appointments/${id}/checkout`, { data: { paymentMethod: "YAPE" } });
  expect(repeat.status()).toBe(409);
  expect((await repeat.json()).error.code).toBe("ALREADY_PAID");
  expect((await data()).cashSession!.expectedCents).toBe(after.cashSession!.expectedCents);

  const overlap = await page.request.post("/api/operations/barbershop/appointments", { data: { customerId, staffId: "staff-mateo", serviceId: "service-cut", startsAt: "2035-01-08T14:30" } });
  expect(overlap.status()).toBe(409);
  expect((await overlap.json()).error.code).toBe("SCHEDULE_CONFLICT");
  const cashAppointment = await createAppointment("2035-01-08T16:00");
  const cashPayment = await page.request.post(`/api/operations/barbershop/appointments/${cashAppointment}/checkout`, { data: { paymentMethod: "CASH" } });
  expect(cashPayment.status(), await cashPayment.text()).toBe(200);
  expect((await data()).cashSession!.expectedCents).toBe(before.cashSession!.expectedCents + sale.totalCents);
  await page.goto("/t/nova-studio/checkout");
  await expect(page.getByText("Efectivo esperado", { exact: true })).toBeVisible();
  await page.screenshot({ path: "output/stages678/barber-cash.png", fullPage: true, animations: "disabled" });

  const pending = await createAppointment("2035-01-08T15:00");
  const closed = await page.request.post(`/api/operations/barbershop/cash/${after.cashSession!.id}/close`, { data: { countedAmount: (before.cashSession!.expectedCents + sale.totalCents) / 100 } });
  expect(closed.status(), await closed.text()).toBe(200);
  const rejected = await page.request.post(`/api/operations/barbershop/appointments/${pending}/checkout`, { data: { paymentMethod: "CASH" } });
  expect(rejected.status()).toBe(409);
  expect((await rejected.json()).error.code).toBe("CASH_CLOSED");
  expect((await data()).appointments.find((entry) => entry.id === pending)?.paid).toBe(false);
});
