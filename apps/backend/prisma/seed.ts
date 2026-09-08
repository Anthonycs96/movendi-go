import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

function atLocalDay(offsetDays: number, hour: number, minute = 0) {
  const value = new Date();
  value.setHours(hour, minute, 0, 0);
  value.setDate(value.getDate() + offsetDays);
  return value;
}

async function clearDatabase() {
  await prisma.saleRefund.deleteMany();
  await prisma.billingPayment.deleteMany();
  await prisma.billingInvoice.deleteMany();
  await prisma.billingSubscription.deleteMany();
  await prisma.billingCustomer.deleteMany();
  await prisma.billingWebhookEvent.deleteMany();
  await prisma.emailOutbox.deleteMany();
  await prisma.billingCheckoutSession.deleteMany();
  await prisma.loginThrottle.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.transportTireEvent.deleteMany();
  await prisma.transportTire.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.inventoryPurchaseLine.deleteMany();
  await prisma.inventoryPurchase.deleteMany();
  await prisma.inventoryCountLine.deleteMany();
  await prisma.inventoryCount.deleteMany();
  await prisma.productRecipeIngredient.deleteMany();
  await prisma.productRecipe.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.transportMaintenanceOrder.deleteMany();
  await prisma.transportFuelLog.deleteMany();
  await prisma.transportPayment.deleteMany();
  await prisma.transportSettlement.deleteMany();
  await prisma.transportExpense.deleteMany();
  await prisma.transportIncident.deleteMany();
  await prisma.transportDocument.deleteMany();
  await prisma.transportTrackingEvent.deleteMany();
  await prisma.transportAssignment.deleteMany();
  await prisma.transportTrip.deleteMany();
  await prisma.transportOperation.deleteMany();
  await prisma.transportWorkLog.deleteMany();
  await prisma.transportDriverLeave.deleteMany();
  await prisma.transportDriver.deleteMany();
  await prisma.transportTrailer.deleteMany();
  await prisma.transportVehicle.deleteMany();
  await prisma.transportRoute.deleteMany();
  await prisma.transportLocation.deleteMany();
  await prisma.transportParty.deleteMany();
  await prisma.restaurantElectronicDocument.deleteMany();
  await prisma.restaurantDocumentSequence.deleteMany();
  await prisma.restaurantIntegrationCredential.deleteMany();
  await prisma.salePayment.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.cashSession.deleteMany();
  await prisma.kitchenTicket.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.restaurantOrder.deleteMany();
  await prisma.diningTable.deleteMany();
  await prisma.diningArea.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.staffSchedule.deleteMany();
  await prisma.service.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.role.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.platformPlan.deleteMany();
}

async function main() {
  await clearDatabase();
  const passwordHash = await hash("Nexo2026!", 12);

  const [starterPlan, professionalPlan] = await Promise.all([
    prisma.platformPlan.create({ data: { id: "plan-starter", key: "STARTER", name: "Inicial", description: "Operación esencial para negocios que están empezando.", monthlyPriceCents: 9900, maxUsers: 5, maxMonthlyOperations: 500, features: JSON.stringify(["Panel operativo", "Clientes", "Caja", "1 sede"]) } }),
    prisma.platformPlan.create({ data: { id: "plan-professional", key: "PROFESSIONAL", name: "Profesional", description: "Más capacidad, sedes y control para equipos en crecimiento.", monthlyPriceCents: 19900, maxUsers: 20, maxMonthlyOperations: 3000, features: JSON.stringify(["Todo Inicial", "Sucursales", "Auditoría", "Soporte prioritario"]) } }),
  ]);

  const [nova, brasa, andes] = await Promise.all([
    prisma.tenant.create({
      data: {
        id: "tenant-nova",
        slug: "nova-studio",
        name: "Nova Studio Barbería",
        shortName: "Nova Studio",
        type: "BARBERSHOP",
        planId: professionalPlan.id,
        subscriptionStatus: "ACTIVE",
        trialEndsAt: atLocalDay(14, 23, 59),
        email: "hola@novastudio.local",
        phone: "+51 940 110 220",
        address: "Av. Arequipa 1840, Lince",
      },
    }),
    prisma.tenant.create({
      data: {
        id: "tenant-brasa",
        slug: "brasa-norte",
        name: "Brasa Norte Restaurante",
        shortName: "Brasa Norte",
        type: "RESTAURANT",
        planId: starterPlan.id,
        subscriptionStatus: "TRIAL",
        trialEndsAt: atLocalDay(14, 23, 59),
        email: "reservas@brasanorte.local",
        phone: "+51 940 330 440",
        address: "Av. Carlos Izaguirre 610, Los Olivos",
      },
    }),
    prisma.tenant.create({
      data: {
        id: "tenant-andes",
        slug: "andes-cargo",
        name: "Andes Cargo & Logistics S.A.C.",
        shortName: "Andes Cargo",
        type: "TRANSPORT",
        planId: professionalPlan.id,
        subscriptionStatus: "ACTIVE",
        email: "operaciones@andescargo.local",
        phone: "+51 940 550 660",
        address: "Av. Néstor Gambetta 1850, Callao",
      },
    }),
  ]);

  const branchRecords = await Promise.all([
    prisma.branch.create({ data: { id: "branch-nova-central", tenantId: nova.id, name: "Sede Lince", address: "Av. Arequipa 1840" } }),
    prisma.branch.create({ data: { id: "branch-nova-miraflores", tenantId: nova.id, name: "Sede Miraflores", address: "Av. Larco 820" } }),
    prisma.branch.create({ data: { id: "branch-brasa-principal", tenantId: brasa.id, name: "Salón principal", address: "Av. Carlos Izaguirre 610" } }),
    prisma.branch.create({ data: { id: "branch-andes-callao", tenantId: andes.id, name: "Base Callao", address: "Av. Néstor Gambetta 1850" } }),
    prisma.branch.create({ data: { id: "branch-andes-arequipa", tenantId: andes.id, name: "Base Arequipa", address: "Vía de Evitamiento km 4" } }),
  ]);
  const novaCentral = branchRecords[0];
  const brasaPrincipal = branchRecords[2];
  const andesCallao = branchRecords[3];

  const [novaAdminRole, novaBarberRole, brasaAdminRole, brasaKitchenRole, andesAdminRole, andesDispatcherRole, andesFinanceRole, andesDriverRole] = await Promise.all([
    prisma.role.create({ data: { id: "role-nova-admin", tenantId: nova.id, key: "ADMIN", name: "Administrador", permissions: JSON.stringify(["*"]) } }),
    prisma.role.create({ data: { id: "role-nova-barber", tenantId: nova.id, key: "BARBER", name: "Barbero", permissions: JSON.stringify(["dashboard:read", "customers:read", "barbershop:appointments:read", "barbershop:appointments:write", "services:read"]) } }),
    prisma.role.create({ data: { id: "role-brasa-admin", tenantId: brasa.id, key: "ADMIN", name: "Administrador", permissions: JSON.stringify(["*"]) } }),
    prisma.role.create({ data: { id: "role-brasa-kitchen", tenantId: brasa.id, key: "KITCHEN", name: "Cocina", permissions: JSON.stringify(["dashboard:read", "restaurant:kitchen:read", "restaurant:kitchen:write", "restaurant:orders:read"]) } }),
    prisma.role.create({ data: { id: "role-andes-admin", tenantId: andes.id, key: "ADMIN", name: "Administrador", permissions: JSON.stringify(["*"]) } }),
    prisma.role.create({ data: { id: "role-andes-dispatch", tenantId: andes.id, key: "DISPATCHER", name: "Despachador", permissions: JSON.stringify(["dashboard:read", "transport:masters:read", "transport:fleet:read", "transport:drivers:read", "transport:operations:read", "transport:operations:write", "transport:documents:read", "transport:fuel:read"]) } }),
    prisma.role.create({ data: { id: "role-andes-finance", tenantId: andes.id, key: "FINANCE", name: "Finanzas", permissions: JSON.stringify(["dashboard:read", "transport:operations:read", "transport:finance:read", "transport:finance:write", "transport:fuel:read", "transport:maintenance:read", "transport:reports:read"]) } }),
    prisma.role.create({ data: { id: "role-andes-driver", tenantId: andes.id, key: "DRIVER", name: "Conductor", permissions: JSON.stringify(["dashboard:read", "transport:operations:read", "transport:operations:write", "transport:documents:read", "transport:fuel:read", "transport:fuel:write"]) } }),
  ]);

  const [superAdmin, novaAdmin, novaBarberUser, brasaAdmin, brasaKitchenUser, andesAdmin, andesDispatcher, andesFinance, andesDriverUser] = await Promise.all([
    prisma.user.create({ data: { id: "user-super", name: "Sofía Plataforma", email: "superadmin@multisaas.local", passwordHash, platformRole: "SUPER_ADMIN" } }),
    prisma.user.create({ data: { id: "user-nova-admin", name: "Valeria Torres", email: "admin@nova.local", passwordHash } }),
    prisma.user.create({ data: { id: "user-nova-barber", name: "Diego Salazar", email: "barbero@nova.local", passwordHash } }),
    prisma.user.create({ data: { id: "user-brasa-admin", name: "Renzo Medina", email: "admin@brasa.local", passwordHash } }),
    prisma.user.create({ data: { id: "user-brasa-kitchen", name: "Camila Rojas", email: "cocina@brasa.local", passwordHash } }),
    prisma.user.create({ data: { id: "user-andes-admin", name: "Mariana Paredes", email: "admin@andes.local", passwordHash } }),
    prisma.user.create({ data: { id: "user-andes-dispatch", name: "Luis Huamán", email: "despacho@andes.local", passwordHash } }),
    prisma.user.create({ data: { id: "user-andes-finance", name: "Elena Vargas", email: "finanzas@andes.local", passwordHash } }),
    prisma.user.create({ data: { id: "user-andes-driver", name: "Jorge Quispe", email: "conductor@andes.local", passwordHash } }),
  ]);

  await prisma.membership.createMany({ data: [
    { id: "membership-super-nova", tenantId: nova.id, userId: superAdmin.id, roleId: novaAdminRole.id, branchId: novaCentral.id },
    { id: "membership-super-brasa", tenantId: brasa.id, userId: superAdmin.id, roleId: brasaAdminRole.id, branchId: brasaPrincipal.id },
    { id: "membership-nova-admin", tenantId: nova.id, userId: novaAdmin.id, roleId: novaAdminRole.id, branchId: novaCentral.id },
    { id: "membership-nova-barber", tenantId: nova.id, userId: novaBarberUser.id, roleId: novaBarberRole.id, branchId: novaCentral.id },
    { id: "membership-brasa-admin", tenantId: brasa.id, userId: brasaAdmin.id, roleId: brasaAdminRole.id, branchId: brasaPrincipal.id },
    { id: "membership-brasa-kitchen", tenantId: brasa.id, userId: brasaKitchenUser.id, roleId: brasaKitchenRole.id, branchId: brasaPrincipal.id },
    { id: "membership-super-andes", tenantId: andes.id, userId: superAdmin.id, roleId: andesAdminRole.id, branchId: andesCallao.id },
    { id: "membership-andes-admin", tenantId: andes.id, userId: andesAdmin.id, roleId: andesAdminRole.id, branchId: andesCallao.id },
    { id: "membership-andes-dispatch", tenantId: andes.id, userId: andesDispatcher.id, roleId: andesDispatcherRole.id, branchId: andesCallao.id },
    { id: "membership-andes-finance", tenantId: andes.id, userId: andesFinance.id, roleId: andesFinanceRole.id, branchId: andesCallao.id },
    { id: "membership-andes-driver", tenantId: andes.id, userId: andesDriverUser.id, roleId: andesDriverRole.id, branchId: andesCallao.id },
  ] });

  const [mateo, diego, lucas] = await Promise.all([
    prisma.staffMember.create({ data: { id: "staff-mateo", tenantId: nova.id, branchId: novaCentral.id, name: "Mateo Ríos", phone: "987654321", specialty: "Fade y barba", commissionPct: 40 } }),
    prisma.staffMember.create({ data: { id: "staff-diego", tenantId: nova.id, branchId: novaCentral.id, userId: novaBarberUser.id, name: "Diego Salazar", phone: "986111222", specialty: "Corte clásico", commissionPct: 38 } }),
    prisma.staffMember.create({ data: { id: "staff-lucas", tenantId: nova.id, branchId: novaCentral.id, name: "Lucas Peña", phone: "985333444", specialty: "Diseño y color", commissionPct: 42 } }),
  ]);

  await prisma.staffSchedule.createMany({ data: [
    ...[1, 2, 3, 4, 5, 6].map((weekday) => ({ tenantId: nova.id, branchId: novaCentral.id, staffId: mateo.id, weekday, startsAt: "09:00", endsAt: "18:00" })),
    ...[1, 2, 3, 4, 5, 6].map((weekday) => ({ tenantId: nova.id, branchId: novaCentral.id, staffId: diego.id, weekday, startsAt: "10:00", endsAt: "19:00" })),
    ...[2, 3, 4, 5, 6, 0].map((weekday) => ({ tenantId: nova.id, branchId: novaCentral.id, staffId: lucas.id, weekday, startsAt: "11:00", endsAt: "20:00" })),
  ] });

  const [classicCut, beard, premium] = await Promise.all([
    prisma.service.create({ data: { id: "service-cut", tenantId: nova.id, branchId: novaCentral.id, name: "Corte clásico", category: "Cabello", durationMinutes: 40, priceCents: 4500 } }),
    prisma.service.create({ data: { id: "service-beard", tenantId: nova.id, branchId: novaCentral.id, name: "Perfilado de barba", category: "Barba", durationMinutes: 25, priceCents: 3000 } }),
    prisma.service.create({ data: { id: "service-premium", tenantId: nova.id, branchId: novaCentral.id, name: "Experiencia premium", category: "Combos", durationMinutes: 70, priceCents: 8500 } }),
  ]);

  const [ana, marco, paola, restaurantCustomer] = await Promise.all([
    prisma.customer.create({ data: { id: "customer-ana", tenantId: nova.id, branchId: novaCentral.id, name: "Ana Valdivia", phone: "999111222", email: "ana@example.test", notes: "Prefiere atención por la mañana" } }),
    prisma.customer.create({ data: { id: "customer-marco", tenantId: nova.id, branchId: novaCentral.id, name: "Marco León", phone: "999333444", email: "marco@example.test" } }),
    prisma.customer.create({ data: { id: "customer-paola", tenantId: nova.id, branchId: novaCentral.id, name: "Paola Núñez", phone: "999555666" } }),
    prisma.customer.create({ data: { id: "customer-brasa-rosa", tenantId: brasa.id, branchId: brasaPrincipal.id, name: "Rosa Delgado", dni: "45872136", phone: "988222333", notes: "Mesa cerca de ventana" } }),
  ]);

  await prisma.appointment.createMany({ data: [
    { id: "appointment-ana", tenantId: nova.id, branchId: novaCentral.id, customerId: ana.id, staffId: mateo.id, serviceId: premium.id, startsAt: atLocalDay(0, 9, 30), endsAt: atLocalDay(0, 10, 40), status: "CONFIRMED", priceCents: premium.priceCents },
    { id: "appointment-marco", tenantId: nova.id, branchId: novaCentral.id, customerId: marco.id, staffId: diego.id, serviceId: classicCut.id, startsAt: atLocalDay(0, 11), endsAt: atLocalDay(0, 11, 40), status: "PENDING", priceCents: classicCut.priceCents },
    { id: "appointment-paola", tenantId: nova.id, branchId: novaCentral.id, customerId: paola.id, staffId: lucas.id, serviceId: beard.id, startsAt: atLocalDay(1, 16), endsAt: atLocalDay(1, 16, 25), status: "CONFIRMED", priceCents: beard.priceCents },
  ] });

  const [entradas, fondos, bebidas] = await Promise.all([
    prisma.category.create({ data: { id: "category-entradas", tenantId: brasa.id, branchId: brasaPrincipal.id, name: "Entradas" } }),
    prisma.category.create({ data: { id: "category-fondos", tenantId: brasa.id, branchId: brasaPrincipal.id, name: "Fondos" } }),
    prisma.category.create({ data: { id: "category-bebidas", tenantId: brasa.id, branchId: brasaPrincipal.id, name: "Bebidas" } }),
  ]);

  const [tequenos, lomo, pollo, chicha] = await Promise.all([
    prisma.product.create({ data: { id: "product-tequenos", tenantId: brasa.id, branchId: brasaPrincipal.id, categoryId: entradas.id, name: "Tequeños de queso", description: "Con salsa de la casa", priceCents: 2400, costCents: 900 } }),
    prisma.product.create({ data: { id: "product-lomo", tenantId: brasa.id, branchId: brasaPrincipal.id, categoryId: fondos.id, name: "Lomo saltado", description: "Clásico peruano al wok", priceCents: 4200, costCents: 1900 } }),
    prisma.product.create({ data: { id: "product-pollo", tenantId: brasa.id, branchId: brasaPrincipal.id, categoryId: fondos.id, name: "Pollo a la brasa 1/4", description: "Con papas y ensalada", priceCents: 3200, costCents: 1400 } }),
    prisma.product.create({ data: { id: "product-chicha", tenantId: brasa.id, branchId: brasaPrincipal.id, categoryId: bebidas.id, name: "Chicha morada", description: "Jarra personal", priceCents: 900, costCents: 250, kitchenArea: "BAR" } }),
  ]);

  const [mainArea, terraceArea] = await Promise.all([
    prisma.diningArea.create({ data: { id: "area-main", tenantId: brasa.id, branchId: brasaPrincipal.id, name: "Salón principal" } }),
    prisma.diningArea.create({ data: { id: "area-terrace", tenantId: brasa.id, branchId: brasaPrincipal.id, name: "Terraza" } }),
  ]);
  const tableRecords = await Promise.all([
    prisma.diningTable.create({ data: { id: "table-1", tenantId: brasa.id, branchId: brasaPrincipal.id, areaId: mainArea.id, name: "Mesa 1", seats: 4, status: "OCCUPIED" } }),
    prisma.diningTable.create({ data: { id: "table-2", tenantId: brasa.id, branchId: brasaPrincipal.id, areaId: terraceArea.id, name: "Mesa 2", seats: 2 } }),
  ]);
  const table1 = tableRecords[0];
  await prisma.diningTable.createMany({ data: [
    { id: "table-3", tenantId: brasa.id, branchId: brasaPrincipal.id, areaId: mainArea.id, name: "Mesa 3", seats: 6 },
    { id: "table-4", tenantId: brasa.id, branchId: brasaPrincipal.id, areaId: terraceArea.id, name: "Mesa 4", seats: 4, status: "RESERVED" },
  ] });

  const openOrder = await prisma.restaurantOrder.create({
    data: {
      id: "order-initial-open",
      tenantId: brasa.id,
      branchId: brasaPrincipal.id,
      tableId: table1.id,
      customerId: restaurantCustomer.id,
      createdById: brasaAdmin.id,
      code: "PED-1001",
      status: "PREPARING",
      subtotalCents: lomo.priceCents + chicha.priceCents,
      totalCents: lomo.priceCents + chicha.priceCents,
      items: { create: [
        { tenantId: brasa.id, productId: lomo.id, name: lomo.name, quantity: 1, unitPriceCents: lomo.priceCents, totalCents: lomo.priceCents, status: "PREPARING", notes: "Término medio" },
        { tenantId: brasa.id, productId: chicha.id, name: chicha.name, quantity: 1, unitPriceCents: chicha.priceCents, totalCents: chicha.priceCents, status: "READY" },
      ] },
    },
  });
  await prisma.kitchenTicket.create({ data: { id: "ticket-initial-open", tenantId: brasa.id, branchId: brasaPrincipal.id, orderId: openOrder.id, status: "PREPARING" } });

  const [clienteAndino, clienteSur] = await Promise.all([
    prisma.transportParty.create({ data: { id: "party-andino", tenantId: andes.id, kind: "CUSTOMER", documentNo: "20123456789", legalName: "Alimentos Andinos S.A.C.", tradeName: "Andino Foods", contactName: "Rosa Gamarra", phone: "987400100", email: "logistica@andino.test", address: "Av. Argentina 2940, Callao" } }),
    prisma.transportParty.create({ data: { id: "party-sur", tenantId: andes.id, kind: "CUSTOMER", documentNo: "20445566771", legalName: "Distribuciones del Sur E.I.R.L.", contactName: "Carlos Neyra", phone: "987400200", email: "compras@delsur.test", address: "Parque Industrial Río Seco, Arequipa" } }),
    prisma.transportParty.create({ data: { id: "party-taller", tenantId: andes.id, kind: "PROVIDER", documentNo: "20660011223", legalName: "Talleres Diesel Pacífico S.A.C.", tradeName: "Diesel Pacífico", phone: "987400300" } }),
    prisma.transportParty.create({ data: { id: "party-carrier", tenantId: andes.id, kind: "CARRIER", documentNo: "20557799110", legalName: "Transportes Aliados del Perú S.A.C.", phone: "987400400" } }),
  ]);

  const [callaoPort, huachipa, arequipaDc, canetePlant] = await Promise.all([
    prisma.transportLocation.create({ data: { id: "location-callao", tenantId: andes.id, code: "CALLAO", name: "Terminal Portuario Callao", address: "Av. Manco Cápac 113, Callao", district: "Callao", province: "Callao", department: "Callao", latitude: -12.052, longitude: -77.139 } }),
    prisma.transportLocation.create({ data: { id: "location-huachipa", tenantId: andes.id, code: "HUACHIPA", name: "Centro Logístico Huachipa", address: "Av. Las Torres 850", district: "Lurigancho", province: "Lima", department: "Lima", latitude: -12.005, longitude: -76.906 } }),
    prisma.transportLocation.create({ data: { id: "location-arequipa", tenantId: andes.id, code: "AQP-DC", name: "Centro de Distribución Arequipa", address: "Vía de Evitamiento km 4", district: "Cerro Colorado", province: "Arequipa", department: "Arequipa", latitude: -16.35, longitude: -71.57 } }),
    prisma.transportLocation.create({ data: { id: "location-canete", tenantId: andes.id, code: "CANETE", name: "Planta Cañete", address: "Panamericana Sur km 145", district: "San Vicente", province: "Cañete", department: "Lima", latitude: -13.08, longitude: -76.38 } }),
  ]);

  const [routeCallaoHuachipa, routeCallaoArequipa, routeCallaoCanete] = await Promise.all([
    prisma.transportRoute.create({ data: { id: "route-callao-huachipa", tenantId: andes.id, code: "CAL-HUA", name: "Callao - Huachipa", originId: callaoPort.id, destinationId: huachipa.id, distanceKm: 42, estimatedMinutes: 150, tollEstimateCents: 800, baseFreightCents: 85000 } }),
    prisma.transportRoute.create({ data: { id: "route-callao-arequipa", tenantId: andes.id, code: "CAL-AQP", name: "Callao - Arequipa", originId: callaoPort.id, destinationId: arequipaDc.id, distanceKm: 1012, estimatedMinutes: 1080, tollEstimateCents: 18600, baseFreightCents: 780000 } }),
    prisma.transportRoute.create({ data: { id: "route-callao-canete", tenantId: andes.id, code: "CAL-CAN", name: "Callao - Cañete", originId: callaoPort.id, destinationId: canetePlant.id, distanceKm: 172, estimatedMinutes: 260, tollEstimateCents: 4200, baseFreightCents: 210000 } }),
  ]);

  const [vehicleA, vehicleB, vehicleC] = await Promise.all([
    prisma.transportVehicle.create({ data: { id: "vehicle-a", tenantId: andes.id, plate: "BXT-841", brand: "Volvo", model: "FH 540", year: 2023, type: "TRACTO", capacityKg: 32000, odometerKm: 184320, status: "ASSIGNED", technicalDueAt: atLocalDay(120, 0), soatDueAt: atLocalDay(180, 0), gpsDeviceId: "GPS-AND-001" } }),
    prisma.transportVehicle.create({ data: { id: "vehicle-b", tenantId: andes.id, plate: "D9K-226", brand: "Scania", model: "R450", year: 2022, type: "TRACTO", capacityKg: 30000, odometerKm: 236850, technicalDueAt: atLocalDay(45, 0), soatDueAt: atLocalDay(90, 0), gpsDeviceId: "GPS-AND-002" } }),
    prisma.transportVehicle.create({ data: { id: "vehicle-c", tenantId: andes.id, plate: "A7P-315", brand: "Hino", model: "500", year: 2021, type: "CAMIÓN RÍGIDO", capacityKg: 12000, odometerKm: 148700, status: "MAINTENANCE", technicalDueAt: atLocalDay(20, 0), soatDueAt: atLocalDay(70, 0) } }),
  ]);
  const [trailerA] = await Promise.all([
    prisma.transportTrailer.create({ data: { id: "trailer-a", tenantId: andes.id, plate: "T8A-921", brand: "Randon", model: "Sider", type: "FURGÓN", capacityKg: 30000, status: "ASSIGNED" } }),
    prisma.transportTrailer.create({ data: { id: "trailer-b", tenantId: andes.id, plate: "T7B-114", brand: "Triton", model: "Plataforma", type: "PLATAFORMA", capacityKg: 28000 } }),
  ]);

  const [driverJorge, driverMilagros, driverEdgar] = await Promise.all([
    prisma.transportDriver.create({ data: { id: "driver-jorge", tenantId: andes.id, documentNo: "44556677", firstName: "Jorge", lastName: "Quispe Ramos", phone: "986700101", email: "conductor@andes.local", licenseNo: "Q44556677", licenseClass: "AIIIB", licenseDueAt: atLocalDay(240, 0), hireDate: atLocalDay(-730, 0), workRegimeName: "6x1", workDays: 6, restDays: 1, workCycleAnchor: atLocalDay(0, 0), status: "ASSIGNED" } }),
    prisma.transportDriver.create({ data: { id: "driver-milagros", tenantId: andes.id, documentNo: "46881234", firstName: "Milagros", lastName: "Ramos Salcedo", phone: "986700102", licenseNo: "R46881234", licenseClass: "AIIIB", licenseDueAt: atLocalDay(160, 0), hireDate: atLocalDay(-420, 0), workRegimeName: "5x2", workDays: 5, restDays: 2, workCycleAnchor: atLocalDay(0, 0) } }),
    prisma.transportDriver.create({ data: { id: "driver-edgar", tenantId: andes.id, documentNo: "40112233", firstName: "Edgar", lastName: "Mendoza León", phone: "986700103", licenseNo: "M40112233", licenseClass: "AIIIC", licenseDueAt: atLocalDay(28, 0), hireDate: atLocalDay(-1100, 0), workRegimeName: "6x1", workDays: 6, restDays: 1, workCycleAnchor: atLocalDay(-6, 0) } }),
  ]);
  await prisma.transportDriverLeave.create({ data: { id: "leave-milagros", tenantId: andes.id, driverId: driverMilagros.id, type: "VACATION", status: "APPROVED", startsAt: atLocalDay(10, 0), endsAt: atLocalDay(15, 23, 59), reason: "Vacaciones programadas" } });
  await prisma.transportWorkLog.createMany({ data: [
    { id: "worklog-jorge", tenantId: andes.id, driverId: driverJorge.id, workDate: atLocalDay(0, 0), scheduledType: "WORK", clockInAt: atLocalDay(0, 6, 5), status: "PRESENT" },
    { id: "worklog-edgar", tenantId: andes.id, driverId: driverEdgar.id, workDate: atLocalDay(0, 0), scheduledType: "REST", status: "SCHEDULED" },
  ] });

  const operationDistribution = await prisma.transportOperation.create({ data: { id: "operation-distribution", tenantId: andes.id, branchId: andesCallao.id, code: "OP-2026-00001", name: "Plan de distribución costa sur", plannedStartAt: atLocalDay(-3, 5), plannedEndAt: atLocalDay(3, 23), status: "IN_PROGRESS", description: "Operación semanal con viajes que se asignan conforme llegan unidades y conductores." } });

  const [tripActive, , tripDelivered] = await Promise.all([
    prisma.transportTrip.create({ data: { id: "trip-active", tenantId: andes.id, branchId: andesCallao.id, operationId: operationDistribution.id, code: "VJ-2026-00001", customerId: clienteAndino.id, routeId: routeCallaoHuachipa.id, serviceType: "Carga completa", cargoDescription: "Alimentos secos paletizados", cargoWeightKg: 18500, scheduledStartAt: atLocalDay(0, 7), scheduledEndAt: atLocalDay(0, 13), actualStartAt: atLocalDay(0, 7, 12), status: "IN_TRANSIT", priority: "HIGH", referenceNo: "OC-AND-8842", freightCents: 98000, budgetCents: 44000 } }),
    prisma.transportTrip.create({ data: { id: "trip-planned", tenantId: andes.id, branchId: andesCallao.id, operationId: operationDistribution.id, code: "VJ-2026-00002", customerId: clienteSur.id, routeId: routeCallaoArequipa.id, serviceType: "Carga completa", cargoDescription: "Productos de consumo masivo", cargoWeightKg: 27000, scheduledStartAt: atLocalDay(2, 5), scheduledEndAt: atLocalDay(3, 1), status: "PLANNED", priority: "NORMAL", referenceNo: "OS-DS-1029", freightCents: 820000, budgetCents: 390000 } }),
    prisma.transportTrip.create({ data: { id: "trip-delivered", tenantId: andes.id, branchId: andesCallao.id, operationId: operationDistribution.id, code: "VJ-2026-00003", customerId: clienteAndino.id, routeId: routeCallaoCanete.id, serviceType: "Distribución", cargoDescription: "Insumos para planta", cargoWeightKg: 9000, scheduledStartAt: atLocalDay(-3, 6), scheduledEndAt: atLocalDay(-3, 14), actualStartAt: atLocalDay(-3, 6, 8), actualEndAt: atLocalDay(-3, 13, 42), status: "DELIVERED", priority: "NORMAL", freightCents: 225000, budgetCents: 105000 } }),
  ]);
  await prisma.transportAssignment.create({ data: { id: "assignment-active", tenantId: andes.id, tripId: tripActive.id, vehicleId: vehicleA.id, trailerId: trailerA.id, driverId: driverJorge.id, startsAt: tripActive.scheduledStartAt, endsAt: tripActive.scheduledEndAt } });
  await prisma.transportTrackingEvent.createMany({ data: [
    { id: "track-departure", tenantId: andes.id, tripId: tripActive.id, type: "DEPARTURE", recordedAt: atLocalDay(0, 7, 12), latitude: -12.052, longitude: -77.139, odometerKm: 184320, description: "Salida confirmada de terminal", source: "DRIVER_APP" },
    { id: "track-position", tenantId: andes.id, tripId: tripActive.id, type: "POSITION", recordedAt: atLocalDay(0, 8, 20), latitude: -12.041, longitude: -77.008, odometerKm: 184338, source: "GPS" },
  ] });
  await prisma.transportIncident.create({ data: { id: "incident-delay", tenantId: andes.id, tripId: tripActive.id, type: "TRÁFICO", severity: "MEDIUM", occurredAt: atLocalDay(0, 8, 10), description: "Congestión por cierre parcial en Línea Amarilla" } });

  await prisma.transportDocument.createMany({ data: [
    { id: "doc-jorge-license", tenantId: andes.id, ownerType: "DRIVER", ownerId: driverJorge.id, type: "LICENCIA", number: driverJorge.licenseNo, issuedAt: atLocalDay(-800, 0), expiresAt: driverJorge.licenseDueAt, status: "VALID" },
    { id: "doc-vehicle-a-soat", tenantId: andes.id, ownerType: "VEHICLE", ownerId: vehicleA.id, type: "SOAT", number: "SOAT-884211", issuedAt: atLocalDay(-180, 0), expiresAt: vehicleA.soatDueAt, status: "VALID" },
    { id: "doc-trailer-a", tenantId: andes.id, ownerType: "TRAILER", ownerId: trailerA.id, type: "TARJETA DE PROPIEDAD", number: "TP-T8A921", status: "VALID" },
    { id: "doc-edgar-license", tenantId: andes.id, ownerType: "DRIVER", ownerId: driverEdgar.id, type: "LICENCIA", number: driverEdgar.licenseNo, expiresAt: driverEdgar.licenseDueAt, status: "VALID" },
  ] });

  await prisma.transportExpense.createMany({ data: [
    { id: "expense-tolls", tenantId: andes.id, tripId: tripDelivered.id, category: "TOLL", description: "Peajes ruta Cañete", amountCents: 4200, occurredAt: atLocalDay(-3, 9), status: "APPROVED", receiptNo: "P-88421" },
    { id: "expense-food", tenantId: andes.id, tripId: tripDelivered.id, category: "FOOD", description: "Alimentación conductor", amountCents: 3800, occurredAt: atLocalDay(-3, 12), status: "APPROVED", receiptNo: "B001-9921" },
    { id: "expense-pending", tenantId: andes.id, tripId: tripActive.id, category: "TOLL", description: "Peaje Línea Amarilla", amountCents: 760, occurredAt: atLocalDay(0, 7, 40), status: "PENDING" },
  ] });
  await prisma.transportSettlement.create({ data: { id: "settlement-delivered", tenantId: andes.id, tripId: tripDelivered.id, incomeCents: tripDelivered.freightCents, expenseCents: 8000, balanceCents: tripDelivered.freightCents - 8000, status: "CLOSED", closedAt: atLocalDay(-2, 9) } });
  await prisma.transportPayment.createMany({ data: [
    { id: "payment-income", tenantId: andes.id, tripId: tripDelivered.id, direction: "IN", partyType: "CUSTOMER", partyId: clienteAndino.id, category: "FLETE", amountCents: tripDelivered.freightCents, method: "TRANSFER", reference: "OP-778811", paidAt: atLocalDay(-1, 10) },
    { id: "payment-driver", tenantId: andes.id, tripId: tripDelivered.id, direction: "OUT", partyType: "DRIVER", partyId: driverJorge.id, category: "VIÁTICOS", amountCents: 15000, method: "TRANSFER", reference: "OP-778845", paidAt: atLocalDay(-2, 16) },
  ] });
  await prisma.transportFuelLog.create({ data: { id: "fuel-active", tenantId: andes.id, tripId: tripActive.id, vehicleId: vehicleA.id, loadedAt: atLocalDay(0, 6, 20), station: "Primax Gambetta", liters: 82.4, priceCents: 1579, totalCents: 130110, odometerKm: 184320, invoiceNo: "F001-98421" } });
  await prisma.transportMaintenanceOrder.createMany({ data: [
    { id: "maintenance-c", tenantId: andes.id, vehicleId: vehicleC.id, code: "OT-2026-00001", type: "CORRECTIVE", title: "Cambio de bomba de agua", description: "Fuga detectada en inspección preoperacional", status: "IN_PROGRESS", priority: "HIGH", scheduledAt: atLocalDay(0, 8), odometerKm: vehicleC.odometerKm, estimatedCents: 185000 },
    { id: "maintenance-a-preventive", tenantId: andes.id, vehicleId: vehicleA.id, code: "OT-2026-00002", type: "PREVENTIVE", title: "Cambio de aceite y filtros", status: "COMPLETED", priority: "NORMAL", scheduledAt: atLocalDay(-45, 8), completedAt: atLocalDay(-45, 12), odometerKm: 171200, estimatedCents: 82000, actualCents: 79500 },
    { id: "maintenance-b-inspection", tenantId: andes.id, vehicleId: vehicleB.id, code: "OT-2026-00003", type: "INSPECTION", title: "Inspección integral de seguridad", status: "COMPLETED", priority: "NORMAL", scheduledAt: atLocalDay(-15, 8), completedAt: atLocalDay(-15, 10), odometerKm: 232400, estimatedCents: 18000, actualCents: 18000 },
  ] });
  const [filterItem, brakeItem] = await Promise.all([
    prisma.inventoryItem.create({ data: { id: "inventory-filter", tenantId: andes.id, branchId: andesCallao.id, sku: "FLT-ACE-001", name: "Filtro de aceite Volvo", kind: "PART", unit: "UND", stock: 6, minimumStock: 3, unitCostCents: 18500 } }),
    prisma.inventoryItem.create({ data: { id: "inventory-brake", tenantId: andes.id, branchId: andesCallao.id, sku: "PAS-FRE-022", name: "Pastilla de freno Hino", kind: "PART", unit: "JGO", stock: 1, minimumStock: 2, unitCostCents: 42000 } }),
  ]);
  await prisma.inventoryMovement.createMany({ data: [
    { id: "movement-filter", tenantId: andes.id, branchId: andesCallao.id, itemId: filterItem.id, type: "PURCHASE", direction: "IN", quantity: 6, stockBefore: 0, stockAfter: 6, unitCostCents: 18500, totalCostCents: 111000, originType: "SEED", reference: "OC-10021" },
    { id: "movement-brake", tenantId: andes.id, branchId: andesCallao.id, itemId: brakeItem.id, type: "PURCHASE", direction: "IN", quantity: 1, stockBefore: 0, stockAfter: 1, unitCostCents: 42000, totalCostCents: 42000, originType: "SEED", reference: "OC-10018" },
  ] });
  const [tireA, tireB] = await Promise.all([
    prisma.transportTire.create({ data: { id: "tire-a", tenantId: andes.id, serialNo: "MIC-26-009821", brand: "Michelin", model: "X Multi", size: "295/80R22.5", purchaseAt: atLocalDay(-90, 0), purchaseCents: 245000, initialTreadMm: 18, currentTreadMm: 14.8, status: "INSTALLED", currentVehicleId: vehicleA.id, currentPosition: "DEL-IZQ" } }),
    prisma.transportTire.create({ data: { id: "tire-b", tenantId: andes.id, serialNo: "BRI-26-001144", brand: "Bridgestone", model: "R284", size: "295/80R22.5", purchaseAt: atLocalDay(-30, 0), purchaseCents: 231000, initialTreadMm: 18, currentTreadMm: 18, status: "STOCK" } }),
  ]);
  await prisma.transportTireEvent.createMany({ data: [
    { id: "tire-event-install", tenantId: andes.id, tireId: tireA.id, vehicleId: vehicleA.id, type: "INSTALL", position: "DEL-IZQ", treadMm: 18, odometerKm: 171200, occurredAt: atLocalDay(-90, 8) },
    { id: "tire-event-inspect", tenantId: andes.id, tireId: tireA.id, vehicleId: vehicleA.id, type: "INSPECTION", position: "DEL-IZQ", treadMm: 14.8, odometerKm: 183900, occurredAt: atLocalDay(-2, 8) },
    { id: "tire-event-stock", tenantId: andes.id, tireId: tireB.id, type: "INSPECTION", treadMm: 18, occurredAt: atLocalDay(-30, 12) },
  ] });

  const [novaCash, brasaCash] = await Promise.all([
    prisma.cashSession.create({ data: { id: "cash-nova-open", tenantId: nova.id, branchId: novaCentral.id, openedById: novaAdmin.id, openingCents: 15000, expectedCents: 15000 } }),
    prisma.cashSession.create({ data: { id: "cash-brasa-open", tenantId: brasa.id, branchId: brasaPrincipal.id, openedById: brasaAdmin.id, openingCents: 25000, expectedCents: 25000 } }),
  ]);

  await prisma.sale.create({ data: { id: "sale-nova-initial", tenantId: nova.id, branchId: novaCentral.id, customerId: marco.id, cashSessionId: novaCash.id, code: "VTA-N-1001", paymentMethod: "YAPE", totalCents: 4500, createdAt: atLocalDay(-1, 17) } });
  await prisma.sale.create({ data: { id: "sale-brasa-initial", tenantId: brasa.id, branchId: brasaPrincipal.id, customerId: restaurantCustomer.id, cashSessionId: brasaCash.id, code: "VTA-B-1001", paymentMethod: "CARD", totalCents: tequenos.priceCents + pollo.priceCents, createdAt: atLocalDay(-1, 20) } });

  await prisma.auditLog.createMany({ data: [
    { tenantId: nova.id, branchId: novaCentral.id, userId: novaAdmin.id, action: "SEED", entityType: "Tenant", entityId: nova.id, metadata: JSON.stringify({ source: "local-seed" }) },
    { tenantId: brasa.id, branchId: brasaPrincipal.id, userId: brasaAdmin.id, action: "SEED", entityType: "Tenant", entityId: brasa.id, metadata: JSON.stringify({ source: "local-seed" }) },
    { tenantId: andes.id, branchId: andesCallao.id, userId: andesAdmin.id, action: "SEED", entityType: "Tenant", entityId: andes.id, metadata: JSON.stringify({ source: "local-seed", transportVersion: 2 }) },
  ] });

  console.log("Datos iniciales creados para nova-studio, brasa-norte y andes-cargo.");
  console.log("Contraseña temporal de los usuarios locales: Nexo2026!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
