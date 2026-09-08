// Service integration check: real disposable PostgreSQL, simulated provider responses, no external requests.
import assert from "node:assert/strict";
import { prisma } from "../apps/backend/src/core/database/prisma";
import { getRestaurantConfiguration, saveRestaurantConfigurationSection } from "../apps/backend/src/modules/restaurant/server/configuration";
import { handleRestaurantCommand } from "../apps/backend/src/modules/restaurant/server/commands";
import { issueRestaurantElectronicDocument, issueRestaurantCreditNote, saveSunatCredentials } from "../apps/backend/src/modules/restaurant/server/sunat";
import { refundRestaurantSale } from "../apps/backend/src/modules/restaurant/server/refunds";

if (!process.env.DATABASE_URL?.startsWith("postgresql://restaurant_qa@127.0.0.1:55439/restaurant_fiscal_qa")) throw new Error("This check requires the explicitly isolated restaurant_fiscal_qa database.");
process.env.INTEGRATION_ENCRYPTION_KEY = "restaurant-fiscal-local-verification-key-2026";
const originalFetch = globalThis.fetch;
const requests: Record<string, unknown>[] = [];
let accepted = false;
globalThis.fetch = async (_input, init) => {
  const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
  requests.push(payload);
  await new Promise((resolve) => setTimeout(resolve, 120));
  return Response.json({ aceptada_por_sunat: accepted, codigo_hash: "simulated-test-hash", enlace_del_pdf: "https://example.com/test.pdf", enlace_del_xml: "https://example.com/test.xml", enlace_del_cdr: accepted ? "https://example.com/test.cdr" : null });
};

try {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "brasa-norte" }, include: { branches: true, memberships: { include: { user: true, role: true } } } });
  const scope = { tenantId: tenant.id, branchId: tenant.branches[0].id, actorId: tenant.memberships.find((member) => member.role.key === "ADMIN")!.userId, permissions: ["*"] };
  const config = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
  await saveRestaurantConfigurationSection(scope.tenantId, "integrations", { ...config.integrations, sunatEnabled: true, sunatEnvironment: "BETA", sunatAutoIssue: false }, scope);
  await saveSunatCredentials(scope, { environment: "BETA", apiUrl: "https://api.nubefact.com/api/v1/local-service-check", token: "simulated-provider-token-2026" });
  const product = await prisma.product.findFirstOrThrow({ where: { tenantId: tenant.id, branchId: scope.branchId, active: true } });
  async function createSale() {
    const order = await handleRestaurantCommand("POST", ["orders"], { source: "TAKEAWAY", items: [{ productId: product.id, quantity: 1 }] }, scope) as { id: string };
    const sale = await handleRestaurantCommand("POST", ["orders", order.id, "checkout"], { paymentMethod: "CARD" }, scope) as { id: string };
    return sale.id;
  }
  const saleId = await createSale();
  const submitted = await issueRestaurantElectronicDocument(scope, saleId, "BOLETA");
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal(requests[0].enviar_automaticamente_a_la_sunat, false);
  const payload = submitted.requestPayload;
  accepted = true;
  const issued = await issueRestaurantElectronicDocument(scope, saleId, "BOLETA");
  assert.equal(issued.status, "ISSUED");
  assert.equal(issued.requestPayload, payload);
  assert.equal(issued.number, submitted.number);
  assert.equal(requests[1].operacion, "consultar_comprobante");
  assert.equal(requests.filter((request) => request.operacion === "generar_comprobante").length, 1);

  const secondSaleId = await createSale();
  const before = requests.length;
  const concurrent = await Promise.allSettled([issueRestaurantElectronicDocument(scope, secondSaleId, "BOLETA"), issueRestaurantElectronicDocument(scope, secondSaleId, "BOLETA")]);
  assert.ok(concurrent.some((result) => result.status === "fulfilled"));
  assert.equal(requests.slice(before).filter((request) => request.operacion === "generar_comprobante").length, 1);
  assert.equal(await prisma.restaurantElectronicDocument.count({ where: { saleId: secondSaleId } }), 1);

  await refundRestaurantSale(scope, saleId, { reason: "Devolución total de verificación local", stockDisposition: "WASTE", paymentConfirmed: true });
  await issueRestaurantCreditNote(scope, saleId);
  const refund = await prisma.saleRefund.findUniqueOrThrow({ where: { saleId } });
  assert.equal(refund.creditStatus, "ISSUED");
  const credit = JSON.parse(refund.creditPayload!);
  assert.equal(credit.tipo_de_comprobante, 3);
  assert.equal(credit.documento_que_se_modifica_numero, issued.number);
  assert.equal(credit.documento_que_se_modifica_serie, issued.series);
  assert.equal(credit.total, JSON.parse(payload!).total);
  const countBeforeRetry = requests.length;
  await issueRestaurantCreditNote(scope, saleId);
  assert.equal(requests.length, countBeforeRetry);
  console.log("Fiscal service checks passed: environment binding, submitted/accepted states, immutable retry, concurrent emission and idempotent credit note. Provider responses were simulated; no real document was issued.");
} finally {
  globalThis.fetch = originalFetch;
  await prisma.$disconnect();
}
