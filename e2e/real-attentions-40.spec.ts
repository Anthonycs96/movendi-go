import { expect, type Page, test } from "@playwright/test";

const password = "Nexo2026!";

type ApiPayload = {
  ok?: boolean;
  id?: string;
  error?: { code?: string };
  [key: string]: unknown;
};
type ApiResult = { status: number; json: ApiPayload };

async function login(page: Page, email: string, businessSlug: string) {
  await page.goto("/login");
  await page.getByLabel(/Correo electrónico/i).fill(email);
  await page.getByLabel(/^Contraseña$/i).fill(password);
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${businessSlug}/dashboard$`));
}

async function api(page: Page, url: string, method = "GET", body?: unknown): Promise<ApiResult> {
  const response = await page.request.fetch(url, {
    method,
    data: body,
    failOnStatusCode: false,
  });
  return { status: response.status(), json: await response.json() as ApiPayload };
}

function expectOk(result: ApiResult) {
  expect(result.status).toBe(200);
  expect(result.json.ok).toBe(true);
}

function expectError(result: ApiResult, status: number, code: string) {
  expect(result.status).toBe(status);
  expect(result.json.error?.code).toBe(code);
}

function businessSlot(index: number, hour = 14, minute = 0) {
  const date = new Date(2035, 0, 1, hour, minute, 0, 0);
  let businessDay = 0;
  while (true) {
    if (date.getDay() !== 0) {
      if (businessDay === index) break;
      businessDay += 1;
    }
    date.setDate(date.getDate() + 1);
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:${pad(minute)}`;
}

async function createBarberCustomer(page: Page, scenario: number) {
  const suffix = `${scenario}-${Date.now().toString().slice(-6)}`;
  const name = `Atención Nova ${suffix}`;
  const result = await api(page, "/api/operations/barbershop/customers", "POST", {
    name,
    phone: `95${String(scenario).padStart(2, "0")}${Date.now().toString().slice(-5)}`,
    email: `nova-${suffix}@example.test`,
  });
  expectOk(result);
  return { id: result.json.id as string, name };
}

async function createAppointment(page: Page, scenario: number, options: {
  staffId?: string;
  serviceId?: string;
  startsAt?: string;
  customerId?: string;
  notes?: string;
} = {}) {
  const customer = options.customerId ? { id: options.customerId, name: "Cliente existente" } : await createBarberCustomer(page, scenario);
  const result = await api(page, "/api/operations/barbershop/appointments", "POST", {
    customerId: customer.id,
    staffId: options.staffId ?? "staff-mateo",
    serviceId: options.serviceId ?? "service-cut",
    startsAt: options.startsAt ?? businessSlot(scenario),
    notes: options.notes ?? `Atención real ${scenario}`,
  });
  expectOk(result);
  return { id: result.json.id as string, customer };
}

async function appointmentStatus(page: Page, id: string, status: string) {
  return api(page, `/api/operations/barbershop/appointments/${id}/status`, "PATCH", { status });
}

async function checkoutAppointment(page: Page, id: string, paymentMethod: string) {
  return api(page, `/api/operations/barbershop/appointments/${id}/checkout`, "POST", { paymentMethod });
}

async function createRestaurantTable(page: Page, scenario: number, suffix = "A") {
  const name = `Mesa atención ${scenario}-${suffix}-${Date.now().toString().slice(-5)}`;
  const result = await api(page, "/api/operations/restaurant/tables", "POST", {
    name,
    seats: 4,
    areaId: "area-main",
  });
  expectOk(result);
  return { id: result.json.id as string, name };
}

async function createOrder(page: Page, scenario: number, options: {
  tableId?: string;
  customerId?: string;
  items?: Array<{ productId: string; quantity: number; notes?: string }>;
  notes?: string;
} = {}) {
  const table = options.tableId ? { id: options.tableId, name: "Mesa existente" } : await createRestaurantTable(page, scenario);
  const result = await api(page, "/api/operations/restaurant/orders", "POST", {
    tableId: table.id,
    customerId: options.customerId,
    items: options.items ?? [{ productId: "product-lomo", quantity: 1 }],
    notes: options.notes ?? `Atención restaurante ${scenario}`,
  });
  expectOk(result);
  return { id: result.json.id as string, table };
}

async function cancelOrder(page: Page, id: string) {
  const result = await api(page, `/api/operations/restaurant/orders/${id}/status`, "PATCH", { status: "CANCELLED" });
  expectOk(result);
}

async function checkoutOrder(page: Page, id: string, paymentMethod: string) {
  return api(page, `/api/operations/restaurant/orders/${id}/checkout`, "POST", { paymentMethod });
}

async function cleanTable(page: Page, tableId: string) {
  const result = await api(page, `/api/operations/restaurant/tables/${tableId}/clean`, "POST");
  expectOk(result);
}

test.describe("40 atenciones transaccionales reales", () => {
  test("[01/40] Barbería: registra una cita pendiente real", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const attention = await createAppointment(page, 1);
    await page.goto("/t/nova-studio/appointments");
    await page.getByPlaceholder("Buscar cliente, servicio o barbero").fill(attention.customer.name);
    await expect(page.getByRole("row").filter({ hasText: attention.customer.name })).toContainText("Pendiente");
  });

  test("[02/40] Barbería: confirma una cita pendiente", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const attention = await createAppointment(page, 2);
    expectOk(await appointmentStatus(page, attention.id, "CONFIRMED"));
    await page.goto("/t/nova-studio/appointments");
    await page.getByPlaceholder("Buscar cliente, servicio o barbero").fill(attention.customer.name);
    await expect(page.getByRole("row").filter({ hasText: attention.customer.name })).toContainText("Confirmada");
  });

  test("[03/40] Barbería: reprograma una cita confirmada y vuelve a pendiente", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const attention = await createAppointment(page, 3);
    expectOk(await appointmentStatus(page, attention.id, "CONFIRMED"));
    const result = await api(page, `/api/operations/barbershop/appointments/${attention.id}/reschedule`, "PATCH", {
      staffId: "staff-mateo", serviceId: "service-cut", startsAt: businessSlot(33, 15, 30), notes: "Reprogramada",
    });
    expectOk(result);
    await page.goto("/t/nova-studio/appointments");
    await page.getByPlaceholder("Buscar cliente, servicio o barbero").fill(attention.customer.name);
    await expect(page.getByRole("row").filter({ hasText: attention.customer.name })).toContainText("Pendiente");
  });

  test("[04/40] Barbería: cancela una cita pendiente", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const attention = await createAppointment(page, 4);
    expectOk(await appointmentStatus(page, attention.id, "CANCELLED"));
    await page.goto("/t/nova-studio/appointments");
    await page.getByPlaceholder("Buscar cliente, servicio o barbero").fill(attention.customer.name);
    await expect(page.getByRole("row").filter({ hasText: attention.customer.name })).toContainText("Cancelada");
  });

  test("[05/40] Barbería: marca una cita confirmada como no asistió", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const attention = await createAppointment(page, 5);
    expectOk(await appointmentStatus(page, attention.id, "CONFIRMED"));
    expectOk(await appointmentStatus(page, attention.id, "NO_SHOW"));
    await page.goto("/t/nova-studio/appointments");
    await page.getByPlaceholder("Buscar cliente, servicio o barbero").fill(attention.customer.name);
    await expect(page.getByRole("row").filter({ hasText: attention.customer.name })).toContainText("No asistió");
  });

  const barberPayments = [
    { number: 6, method: "CASH" },
    { number: 7, method: "CARD" },
    { number: 8, method: "TRANSFER" },
    { number: 9, method: "YAPE" },
    { number: 10, method: "PLIN" },
    { number: 11, method: "OTHER" },
  ];

  for (const payment of barberPayments) {
    test(`[${String(payment.number).padStart(2, "0")}/40] Barbería: cobra una atención con ${payment.method}`, async ({ page }) => {
      await login(page, "admin@nova.local", "nova-studio");
      const attention = await createAppointment(page, payment.number);
      expectOk(await appointmentStatus(page, attention.id, "CONFIRMED"));
      expectOk(await checkoutAppointment(page, attention.id, payment.method));
      await page.goto("/t/nova-studio/checkout");
      await expect(page.getByRole("row").filter({ hasText: attention.customer.name })).toContainText(payment.method);
    });
  }

  test("[12/40] Barbería: impide completar una atención sin cobrar", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const attention = await createAppointment(page, 12);
    expectError(await appointmentStatus(page, attention.id, "COMPLETED"), 409, "CHECKOUT_REQUIRED");
  });

  test("[13/40] Barbería: impide cobrar dos veces la misma atención", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const attention = await createAppointment(page, 13);
    expectOk(await checkoutAppointment(page, attention.id, "CARD"));
    expectError(await checkoutAppointment(page, attention.id, "CARD"), 409, "ALREADY_PAID");
  });

  test("[14/40] Barbería: impide cambiar el estado de una cita cancelada", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const attention = await createAppointment(page, 14);
    expectOk(await appointmentStatus(page, attention.id, "CANCELLED"));
    expectError(await appointmentStatus(page, attention.id, "CONFIRMED"), 409, "APPOINTMENT_CLOSED");
  });

  test("[15/40] Barbería: impide reprogramar una cita cancelada", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const attention = await createAppointment(page, 15);
    expectOk(await appointmentStatus(page, attention.id, "CANCELLED"));
    expectError(await api(page, `/api/operations/barbershop/appointments/${attention.id}/reschedule`, "PATCH", {
      staffId: "staff-mateo", serviceId: "service-cut", startsAt: businessSlot(35),
    }), 409, "APPOINTMENT_CLOSED");
  });

  test("[16/40] Barbería: bloquea dos atenciones superpuestas del mismo profesional", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    await createAppointment(page, 16, { startsAt: businessSlot(16, 16, 0) });
    const customer = await createBarberCustomer(page, 116);
    expectError(await api(page, "/api/operations/barbershop/appointments", "POST", {
      customerId: customer.id, staffId: "staff-mateo", serviceId: "service-cut", startsAt: businessSlot(16, 16, 20),
    }), 409, "SCHEDULE_CONFLICT");
  });

  test("[17/40] Barbería: permite atenciones simultáneas con profesionales diferentes", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    await createAppointment(page, 17, { staffId: "staff-mateo", startsAt: businessSlot(17, 15, 0) });
    const second = await createBarberCustomer(page, 117);
    expectOk(await api(page, "/api/operations/barbershop/appointments", "POST", {
      customerId: second.id, staffId: "staff-diego", serviceId: "service-cut", startsAt: businessSlot(17, 15, 0),
    }));
  });

  test("[18/40] Barbería: el rol Barbero confirma una atención permitida", async ({ page }) => {
    await login(page, "barbero@nova.local", "nova-studio");
    const attention = await createAppointment(page, 18, {
      customerId: "customer-ana", staffId: "staff-diego", startsAt: businessSlot(18, 16, 0),
    });
    expectOk(await appointmentStatus(page, attention.id, "CONFIRMED"));
  });

  test("[19/40] Barbería: reprograma cambiando profesional y servicio", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const attention = await createAppointment(page, 19);
    expectOk(await api(page, `/api/operations/barbershop/appointments/${attention.id}/reschedule`, "PATCH", {
      staffId: "staff-diego", serviceId: "service-beard", startsAt: businessSlot(39, 17, 0), notes: "Cambio integral",
    }));
    await page.goto("/t/nova-studio/appointments");
    await page.getByPlaceholder("Buscar cliente, servicio o barbero").fill(attention.customer.name);
    const row = page.getByRole("row").filter({ hasText: attention.customer.name });
    await expect(row).toContainText("Perfilado de barba");
    await expect(row).toContainText("Diego Salazar");
  });

  test("[20/40] Barbería: bloquea cobro sin caja y permite continuar al reabrirla", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const attention = await createAppointment(page, 20);
    expectOk(await api(page, "/api/operations/barbershop/cash/cash-nova-open/close", "POST", { countedAmount: 0 }));
    expectError(await checkoutAppointment(page, attention.id, "CASH"), 409, "CASH_CLOSED");
    expectOk(await api(page, "/api/operations/barbershop/cash", "POST", { openingAmount: 100 }));
    expectOk(await checkoutAppointment(page, attention.id, "CASH"));
  });

  test("[21/40] Restaurante: reserva y libera una mesa real", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const table = await createRestaurantTable(page, 21);
    expectOk(await api(page, `/api/operations/restaurant/tables/${table.id}/reserve`, "POST"));
    expectOk(await api(page, `/api/operations/restaurant/tables/${table.id}/reserve`, "POST"));
    await page.goto("/t/brasa-norte/floor");
    await expect(page.locator(".floor-table").filter({ hasText: table.name })).toContainText("Libre");
  });

  test("[22/40] Restaurante: una mesa reservada bloquea la apertura de pedido", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const table = await createRestaurantTable(page, 22);
    expectOk(await api(page, `/api/operations/restaurant/tables/${table.id}/reserve`, "POST"));
    expectError(await api(page, "/api/operations/restaurant/orders", "POST", {
      tableId: table.id, items: [{ productId: "product-lomo", quantity: 1 }],
    }), 409, "TABLE_NOT_AVAILABLE");
    expectOk(await api(page, `/api/operations/restaurant/tables/${table.id}/reserve`, "POST"));
  });

  test("[23/40] Restaurante: abre un pedido de un producto y lo muestra en salón", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const order = await createOrder(page, 23);
    await page.getByRole("link", { name: /^Pedidos/ }).click();
    await expect(page).toHaveURL(/\/t\/brasa-norte\/orders$/);
    await page.getByPlaceholder("Buscar pedido o mesa").fill(order.table.name);
    await expect(page.getByRole("row").filter({ hasText: order.table.name })).toContainText("1× Lomo saltado");
    await cancelOrder(page, order.id);
  });

  test("[24/40] Restaurante: abre un pedido con productos de cocina y barra", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const order = await createOrder(page, 24, { items: [
      { productId: "product-lomo", quantity: 1 },
      { productId: "product-chicha", quantity: 2 },
    ] });
    await page.getByRole("link", { name: /^Pedidos/ }).click();
    await expect(page).toHaveURL(/\/t\/brasa-norte\/orders$/);
    await page.getByPlaceholder("Buscar pedido o mesa").fill(order.table.name);
    const row = page.getByRole("row").filter({ hasText: order.table.name });
    await expect(row).toContainText("Lomo saltado");
    await expect(row).toContainText("2× Chicha morada");
    await cancelOrder(page, order.id);
  });

  test("[25/40] Restaurante: calcula el total usando cantidades reales", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const order = await createOrder(page, 25, { items: [{ productId: "product-lomo", quantity: 3 }] });
    await page.goto("/t/brasa-norte/orders");
    await page.getByPlaceholder("Buscar pedido o mesa").fill(order.table.name);
    await expect(page.getByRole("row").filter({ hasText: order.table.name })).toContainText("S/ 126.00");
    await cancelOrder(page, order.id);
  });

  test("[26/40] Restaurante: vincula un pedido con un cliente real", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const order = await createOrder(page, 26, { customerId: "customer-brasa-rosa" });
    await page.goto("/t/brasa-norte/orders");
    await page.getByPlaceholder("Buscar pedido o mesa").fill(order.table.name);
    await expect(page.getByRole("row").filter({ hasText: order.table.name })).toContainText("Rosa Delgado");
    await cancelOrder(page, order.id);
  });

  test("[27/40] Restaurante: admite una atención sin cliente identificado", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const order = await createOrder(page, 27);
    await page.goto("/t/brasa-norte/orders");
    await page.getByPlaceholder("Buscar pedido o mesa").fill(order.table.name);
    await expect(page.getByRole("row").filter({ hasText: order.table.name })).toContainText("Sin cliente");
    await cancelOrder(page, order.id);
  });

  test("[28/40] Restaurante: cocina inicia la preparación de una comanda real", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const order = await createOrder(page, 28);
    await page.goto("/t/brasa-norte/kitchen");
    const ticket = page.locator(".kitchen-ticket").filter({ hasText: order.table.name });
    await ticket.getByRole("button", { name: "Iniciar preparación" }).click();
    await expect(ticket.getByRole("button", { name: "Marcar listo" })).toBeVisible();
    await cancelOrder(page, order.id);
  });

  test("[29/40] Restaurante: cocina marca una comanda como lista", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const order = await createOrder(page, 29);
    await page.goto("/t/brasa-norte/kitchen");
    const ticket = page.locator(".kitchen-ticket").filter({ hasText: order.table.name });
    await ticket.getByRole("button", { name: "Iniciar preparación" }).click();
    await ticket.getByRole("button", { name: "Marcar listo" }).click();
    await expect(ticket.getByRole("button", { name: "Entregado" })).toBeVisible();
    await cancelOrder(page, order.id);
  });

  test("[30/40] Restaurante: cocina entrega una comanda y sincroniza el pedido", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const order = await createOrder(page, 30);
    await page.goto("/t/brasa-norte/kitchen");
    const ticket = page.locator(".kitchen-ticket").filter({ hasText: order.table.name });
    await ticket.getByRole("button", { name: "Iniciar preparación" }).click();
    await ticket.getByRole("button", { name: "Marcar listo" }).click();
    await ticket.getByRole("button", { name: "Entregado" }).click();
    await expect(ticket).toBeHidden();
    await page.goto("/t/brasa-norte/orders");
    await page.getByPlaceholder("Buscar pedido o mesa").fill(order.table.name);
    await expect(page.getByRole("row").filter({ hasText: order.table.name })).toContainText("Servido");
    await cancelOrder(page, order.id);
  });

  test("[31/40] Restaurante: traslada una atención entre dos mesas", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const origin = await createRestaurantTable(page, 31, "origen");
    const target = await createRestaurantTable(page, 31, "destino");
    const order = await createOrder(page, 31, { tableId: origin.id });
    expectOk(await api(page, `/api/operations/restaurant/orders/${order.id}/transfer`, "PATCH", { tableId: target.id }));
    await page.goto("/t/brasa-norte/orders");
    await page.getByPlaceholder("Buscar pedido o mesa").fill(target.name);
    await expect(page.getByRole("row").filter({ hasText: target.name })).toBeVisible();
    await cancelOrder(page, order.id);
  });

  test("[32/40] Restaurante: rechaza trasladar un pedido a una mesa ocupada", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const order = await createOrder(page, 32);
    expectError(await api(page, `/api/operations/restaurant/orders/${order.id}/transfer`, "PATCH", { tableId: "table-1" }), 404, "NOT_FOUND");
    await cancelOrder(page, order.id);
  });

  test("[33/40] Restaurante: cancelar el pedido libera realmente la mesa", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const order = await createOrder(page, 33);
    await cancelOrder(page, order.id);
    await page.goto("/t/brasa-norte/floor");
    await expect(page.locator(".floor-table").filter({ hasText: order.table.name })).toContainText("Libre");
  });

  const restaurantPayments = [
    { number: 34, method: "CASH", label: "Efectivo" },
    { number: 35, method: "CARD", label: "Tarjeta" },
    { number: 36, method: "TRANSFER", label: "Transferencia" },
    { number: 37, method: "YAPE", label: "Yape" },
    { number: 38, method: "PLIN", label: "Plin" },
    { number: 39, method: "OTHER", label: "Otro" },
  ];

  for (const payment of restaurantPayments) {
    test(`[${payment.number}/40] Restaurante: cobra un pedido con ${payment.method} y limpia la mesa`, async ({ page }) => {
      await login(page, "admin@brasa.local", "brasa-norte");
      const order = await createOrder(page, payment.number);
      expectOk(await checkoutOrder(page, order.id, payment.method));
      await page.goto("/t/brasa-norte/checkout");
      await expect(page.getByRole("row").filter({ hasText: payment.label }).last()).toContainText("S/ 42.00");
      await cleanTable(page, order.table.id);
    });
  }

  test("[40/40] Restaurante: bloquea cobro sin caja y permite continuar al reabrirla", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const order = await createOrder(page, 40);
    expectOk(await api(page, "/api/operations/restaurant/cash/cash-brasa-open/close", "POST", { countedAmount: 0 }));
    expectError(await checkoutOrder(page, order.id, "CARD"), 409, "CASH_CLOSED");
    expectOk(await api(page, "/api/operations/restaurant/cash", "POST", { openingAmount: 200 }));
    expectOk(await checkoutOrder(page, order.id, "CARD"));
    await cleanTable(page, order.table.id);
  });
});
