import { expect, test } from "@playwright/test";

test("Transporte conserva entrada, consumo y rechazo por stock insuficiente en su API actual", async ({ request }) => {
  const password = "Nexo2026!";
  const login = await request.post("/api/auth/login", { data: { email: "admin@andes.local", businessSlug: "andes-cargo", password, rememberSession: false } });
  expect(login.status(), await login.text()).toBe(200);
  if ((await login.json()).redirectTo.startsWith("/change-password")) {
    const changed = await request.post("/api/auth/change-password", { data: { currentPassword: password, newPassword: `${password}-inventory` } });
    expect(changed.status(), await changed.text()).toBe(200);
  }

  const created = await request.post("/api/operations/transport/inventory", { data: { sku: `HEX-${Date.now()}`, name: "Filtro de prueba hexagonal", unit: "UND", minimumStock: 1, unitCost: 120 } });
  expect(created.status(), await created.text()).toBe(200);
  const itemId = (await created.json()).id as string;
  const endpoint = `/api/operations/transport/inventory/${itemId}/movements`;

  const incoming = await request.post(endpoint, { data: { type: "IN", quantity: 3, reference: "OC-HEX" } });
  expect(incoming.status(), await incoming.text()).toBe(200);
  const outgoing = await request.post(endpoint, { data: { type: "OUT", quantity: 1, reference: "OT-HEX" } });
  expect(outgoing.status(), await outgoing.text()).toBe(200);
  const insufficient = await request.post(endpoint, { data: { type: "OUT", quantity: 3 } });
  expect(insufficient.status()).toBe(409);
  expect((await insufficient.json()).error.code).toBe("INSUFFICIENT_STOCK");

  const inventory = await request.get("/api/data/tenant?section=inventory");
  expect(inventory.status(), await inventory.text()).toBe(200);
  const data = (await inventory.json()).data.inventoryModule as {
    items: Array<{ id: string; stock: number; unitCostCents: number }>;
    movements: Array<{ itemId: string; direction: string; quantity: number; originType: string }>;
  };
  expect(data.items.find((item) => item.id === itemId)).toMatchObject({ stock: 2, unitCostCents: 12000 });
  const movements = data.movements.filter((movement) => movement.itemId === itemId);
  expect(movements).toHaveLength(2);
  expect(movements).toEqual(expect.arrayContaining([
    expect.objectContaining({ direction: "IN", quantity: 3, originType: "TRANSPORT_MAINTENANCE" }),
    expect.objectContaining({ direction: "OUT", quantity: 1, originType: "TRANSPORT_MAINTENANCE" }),
  ]));
});
