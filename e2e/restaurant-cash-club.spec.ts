import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdir } from "node:fs/promises";
const db = new PrismaClient();
let cashId = "", orderId = "", saleId = "", customerId = "", expectedCents = 0;
test.describe.configure({ mode: "serial" });
async function login(request: APIRequestContext, slug="brasa-norte", email="superadmin@multisaas.local") {
  expect((await request.post("/api/auth/login", { data: { email, password:"Nexo2026!",businessSlug:slug } })).ok()).toBe(true);
}
async function post(request:APIRequestContext,path:string,data:object) {
  const response=await request.post(`/api/operations/restaurant/${path}`,{data});
  expect(response.status(),await response.text()).toBe(200);return response.json();
}
test.afterAll(async()=>{await db.$disconnect();});

test("apertura, cobro mixto con vuelto, movimientos y arqueo desde caja",async({page})=>{
  await login(page.request);
  const seededCash = (await (await page.request.get("/api/data/restaurant-cash")).json()).cash;
  if (seededCash) await post(page.request, `cash/${seededCash.id}/close`, { countedAmount: seededCash.expectedCents / 100 });
  const workspace=await (await page.request.get("/api/data/tenant?section=floor")).json();
  const config=workspace.data.configuration;
  expect((await page.request.patch("/api/operations/restaurant/configuration/sales",{data:{...config.sales,splitPaymentsEnabled:true}})).ok()).toBe(true);
  expect((await page.request.patch("/api/operations/restaurant/configuration/customers",{data:{...config.customers,loyaltyEnabled:true,pointsPerCurrencyUnit:1}})).ok()).toBe(true);
  customerId=(await post(page.request,"customers",{name:"Cliente Club Caja",phone:"955881122"})).id;
  const product=workspace.data.products.find((item:{active:boolean;priceCents:number})=>item.active && item.priceCents>0);
  orderId=(await post(page.request,"orders",{source:"TAKEAWAY",customerId,items:[{productId:product.id,quantity:2}]})).id;
  const order=await db.restaurantOrder.findUniqueOrThrow({where:{id:orderId}});
  await page.goto("/t/brasa-norte/checkout");
  await expect(page.getByRole("tab",{name:"Caja actual",exact:true})).toHaveAttribute("aria-selected","true");
  await page.getByRole("button",{name:"Abrir caja",exact:true}).click();
  let dialog=page.getByRole("dialog");
  await dialog.getByLabel("Caja o punto de venta").fill("Caja terraza");
  await dialog.getByLabel("Monto inicial (S/)").fill("100");
  await dialog.getByLabel("Observación de apertura").fill("Turno de prueba completo");
  await dialog.getByRole("button",{name:"Abrir caja",exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Caja terraza",{exact:true})).toBeVisible();
  cashId=(await (await page.request.get("/api/data/restaurant-cash")).json()).cash.id;
  const row=page.locator("#cash-pending-orders").getByRole("row").filter({hasText:order.code});
  await row.getByRole("button",{name:"Cobrar",exact:true}).click();
  dialog=page.getByRole("dialog");
  await dialog.getByLabel("Dividir pago").check();
  await dialog.getByLabel("Primer medio").selectOption("CASH");
  const halfCents=Math.floor(order.totalCents/2);
  await dialog.getByLabel("Monto",{exact:true}).fill((halfCents/100).toFixed(2));
  await dialog.getByLabel("Segundo medio").selectOption("YAPE");
  await dialog.getByLabel("Efectivo recibido (S/)").fill(((halfCents+1000)/100).toFixed(2));
  await expect(dialog.locator(".cash-change")).toContainText("10.00");
  await dialog.getByRole("button",{name:"Confirmar cobro"}).click();
  await expect(dialog).not.toBeVisible();
  await expect(row).toHaveCount(0);
  const sale=await db.sale.findUniqueOrThrow({where:{orderId}});saleId=sale.id;
  expect(sale.cashReceivedCents).toBe(halfCents+1000);expect(sale.changeCents).toBe(1000);
  for(const [button,title,amount,reason] of [["Ingreso","Ingreso de efectivo","20","Fondo adicional"],["Retiro","Retiro de efectivo","5","Movilidad del turno"]]){
    await page.getByRole("button",{name:button,exact:true}).click();dialog=page.getByRole("dialog",{name:title});
    await dialog.getByLabel("Monto (S/)").fill(amount);await dialog.getByLabel("Motivo",{exact:true}).fill(reason);
    await dialog.getByRole("button",{name:"Guardar",exact:true}).click();await expect(dialog).not.toBeVisible();
  }
  expectedCents=10000+halfCents+2000-500;
  await expect.poll(async()=> (await (await page.request.get("/api/data/restaurant-cash")).json()).cash.expectedCents).toBe(expectedCents);
  await page.getByRole("button",{name:"Actualizar caja"}).click();
  await expect(page.locator(".cash-turn-summary")).toContainText((expectedCents/100).toFixed(2));
  await page.getByRole("button",{name:"Cerrar caja",exact:true}).click();dialog=page.getByRole("dialog");
  await dialog.getByLabel("Monto contado (S/)").fill((expectedCents/100).toFixed(2));
  await expect(dialog.locator(".cash-change")).toContainText("Cuadra");
  await dialog.getByRole("checkbox").check();await dialog.getByRole("button",{name:"Confirmar cierre"}).click();
  await expect(dialog).not.toBeVisible();await expect(page.getByText("Caja cerrada",{exact:true})).toBeVisible();
  await page.getByRole("tab",{name:"Historial de cajas",exact:true}).click();
  await page.getByRole("row").filter({hasText:"Caja terraza"}).getByRole("button",{name:"Ver detalle"}).click();
  await expect(page.getByRole("dialog")).toContainText("Turno de prueba completo");
  await expect(page.getByRole("dialog")).toContainText("Movilidad del turno");
  await mkdir("outputs/restaurant-ux",{recursive:true});await page.screenshot({path:"outputs/restaurant-ux/cash-history.png",fullPage:true});
});

test("devolución de otro turno afecta solo la caja actual y revierte puntos",async({request})=>{
  await login(request);
  const newCash=(await post(request,"cash",{openingAmount:100,registerName:"Segundo turno",idempotencyKey:"second-shift-0001"})).id;
  const customer=await db.customer.findUniqueOrThrow({where:{id:customerId}});expect(customer.loyaltyPoints).toBeGreaterThan(0);
  const refund={reason:"Devolución solicitada por cliente",stockDisposition:"WASTE",paymentConfirmed:true};
  await post(request,`sales/${saleId}/refund`,refund);await post(request,`sales/${saleId}/refund`,refund);
  const current=(await (await request.get("/api/data/restaurant-cash")).json()).cash;
  expect(current.id).toBe(newCash);expect(current.movementCount).toBe(1);expect(current.outCents).toBe(0);
  expect(current.cashRefundsCents).toBeGreaterThan(0);expect(current.expectedCents).toBe(10000-current.cashRefundsCents);
  expect(current.methods.find((row:{method:string})=>row.method==="YAPE").refundedCents).toBeGreaterThan(0);
  expect((await db.customer.findUniqueOrThrow({where:{id:customerId}})).loyaltyPoints).toBe(0);
  const closed=(await (await request.get(`/api/data/restaurant-cash?id=${cashId}`)).json()).cash;
  expect(closed.expectedCents).toBe(expectedCents);expect(closed.differenceCents).toBe(0);
});

test("reintentos, saldo insuficiente, cierre obsoleto y diferencia con motivo",async({request})=>{
  await login(request);
  const current=(await (await request.get("/api/data/restaurant-cash")).json()).cash;
  const requestBody={type:"IN",amount:10,reason:"Aporte de prueba",notes:"Una sola vez",idempotencyKey:"movement-cash-0001"};
  const first=await post(request,`cash/${current.id}/movement`,requestBody);const second=await post(request,`cash/${current.id}/movement`,requestBody);expect(second.id).toBe(first.id);
  expect((await request.post(`/api/operations/restaurant/cash/${current.id}/movement`,{data:{type:"OUT",amount:999999,reason:"Sin saldo"}})).status()).toBe(409);
  expect((await request.post(`/api/operations/restaurant/cash/${current.id}/close`,{data:{countedAmount:0,expectedCents:current.expectedCents}})).status()).toBe(409);
  expect((await request.post(`/api/operations/restaurant/cash/${current.id}/close`,{data:{countedAmount:0}})).status()).toBe(400);
  await post(request,`cash/${current.id}/close`,{countedAmount:0,notes:"Diferencia revisada por administración"});
  expect((await request.post(`/api/operations/restaurant/cash/${current.id}/movement`,{data:{type:"IN",amount:10,reason:"Caja cerrada"}})).status()).toBe(404);
  const input={openingAmount:10,registerName:"Caja idempotente",idempotencyKey:"open-once-0001"};
  const opened=await post(request,"cash",input);expect((await post(request,"cash",input)).id).toBe(opened.id);
  expect((await request.post("/api/operations/restaurant/cash",{data:{...input,openingAmount:11}})).status()).toBe(409);
  expect((await request.post("/api/operations/restaurant/cash",{data:{openingAmount:10}})).status()).toBe(409);
  await post(request,`cash/${opened.id}/close`,{countedAmount:10});
  const concurrent=await Promise.all([1,2].map((number)=>request.post("/api/operations/restaurant/cash",{data:{openingAmount:10,idempotencyKey:`concurrent-open-${number}`}})));
  expect(concurrent.filter((response)=>response.status()===200)).toHaveLength(1);
  expect(concurrent.filter((response)=>response.status()===409)).toHaveLength(1);
});

test("club, productos y promociones operables con ficha y formularios simplificados",async({page})=>{
  await login(page.request);await page.goto("/t/brasa-norte/clients");
  await page.getByRole("row").filter({hasText:"Cliente Club Caja"}).getByRole("button",{name:"Ver ficha"}).click();
  await expect(page.getByRole("dialog")).toContainText("Revertidos");
  await page.getByRole("dialog").press("Escape");
  await page.goto("/t/brasa-norte/menu");
  const productRow=page.getByRole("row").filter({hasText:"Chicha morada"});
  await productRow.getByRole("button",{name:"Editar",exact:true}).click();
  let dialog=page.getByRole("dialog");await dialog.getByLabel("Afectación tributaria").selectOption("EXONERADA");
  await dialog.getByRole("button",{name:"Actualizar",exact:true}).click();await expect(dialog).not.toBeVisible();
  await productRow.getByRole("button",{name:"Editar",exact:true}).click();
  await expect(page.getByRole("dialog").getByLabel("Afectación tributaria")).toHaveValue("EXONERADA");
  await page.screenshot({path:"outputs/restaurant-ux/product-editor.png"});await page.getByRole("dialog").press("Escape");
  await page.goto("/t/brasa-norte/promotions");await page.getByRole("button",{name:"Nueva promoción",exact:true}).click();
  dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:"2 × 1",exact:true}).click();
  await dialog.getByLabel("Nombre comercial").fill("Club dos por uno");
  await expect(dialog.getByLabel("Unidades requeridas")).toHaveValue("2");
  await expect(dialog.getByLabel("Descuento (%)")).toHaveCount(0);
  await expect(dialog.getByLabel("Categoría",{exact:true})).toHaveCount(0);
  await page.screenshot({path:"outputs/restaurant-ux/promotion-editor.png"});
  await dialog.getByRole("button",{name:"Crear promoción"}).click();await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("row").filter({hasText:"Club dos por uno"})).toBeVisible();
});

test("permisos y aislamiento protegen caja y club en la API",async({request})=>{
  await login(request,"brasa-norte","cocina@brasa.local");
  for(const path of ["restaurant-cash","restaurant-club","restaurant-history?kind=cash"])expect((await request.get(`/api/data/${path}`)).status()).toBe(403);
  expect((await request.post("/api/operations/restaurant/cash",{data:{openingAmount:1}})).status()).toBe(403);
  await login(request,"nova-studio");expect((await request.get(`/api/data/restaurant-cash?id=${cashId}`)).status()).toBe(403);
  await login(request);expect((await request.get("/api/data/restaurant-cash?id=not-owned")).status()).toBe(404);
  expect((await request.get("/api/data/restaurant-club?id=not-owned")).status()).toBe(404);
  const foreignCash = await db.cashSession.findFirstOrThrow({ where: { tenant: { slug: "nova-studio" } } });
  expect((await request.get(`/api/data/restaurant-cash?id=${foreignCash.id}`)).status()).toBe(404);
  const foreignCustomer = await db.customer.findFirstOrThrow({ where: { tenant: { slug: "nova-studio" } } });
  expect((await request.get(`/api/data/restaurant-club?id=${foreignCustomer.id}`)).status()).toBe(404);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: "brasa-norte" } });
  const branch = await db.branch.findFirstOrThrow({ where: { tenantId: tenant.id } });
  const admin = await db.user.findFirstOrThrow({ where: { email: "admin@brasa.local" } });
  const role = await db.role.create({ data: { tenantId: tenant.id, key: "CASH_TEST", name: "Cajero sin reportes", permissions: JSON.stringify(["restaurant:cash:write", "restaurant:orders:read"]) } });
  await db.user.create({ data: { name: "Cajero limitado", email: "limited-cash@brasa.local", passwordHash: admin.passwordHash, memberships: { create: { tenantId: tenant.id, branchId: branch.id, roleId: role.id } } } });
  await login(request,"brasa-norte","limited-cash@brasa.local");
  expect((await request.get("/api/data/restaurant-cash")).status()).toBe(200);
  expect((await request.get(`/api/data/restaurant-cash?id=${cashId}`)).status()).toBe(403);
  expect((await request.get("/api/data/restaurant-history?kind=cash")).status()).toBe(403);
  expect((await request.get("/api/data/restaurant-history?kind=movements")).status()).toBe(403);
});
