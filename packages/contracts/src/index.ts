export * from "./restaurant-areas";

export type BusinessType = "BARBERSHOP" | "RESTAURANT" | "TRANSPORT";

export interface AuthSessionView {
  sessionId: string;
  userId: string;
  membershipId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantShortName: string;
  tenantType: BusinessType;
  tenantLocale: string;
  tenantCurrency: string;
  tenantTimezone: string;
  branchId: string;
  branchName: string;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  roleKey: string;
  roleName: string;
  permissions: string[];
  enabledModules: string[];
  platformRole: string | null;
  mustChangePassword: boolean;
  expiresAt: string;
}

export interface BranchSummary { id: string; name: string }
export interface BusinessAccessSummary { name: string; slug: string; type: BusinessType }

export interface InventoryItemDto { id: string; sku: string; barcode: string | null; name: string; kind: string; unit: string; stock: number; minimumStock: number; unitCostCents: number; trackStock: boolean; notes: string | null; active: boolean; createdAt: string; updatedAt: string }
export interface InventoryMovementDto { id: string; itemId: string; type: string; direction: string; quantity: number; stockBefore: number; stockAfter: number; unitCostCents: number; totalCostCents: number; originType: string; originId: string | null; reference: string | null; notes: string | null; occurredAt: string; item: { name: string; sku: string; unit: string }; actor: { name: string; email: string } | null }
export interface InventoryPurchaseDto { id: string; code: string; supplierName: string; documentNumber: string | null; status: string; totalCents: number; notes: string | null; purchasedAt: string; createdBy: { name: string; email: string }; lines: Array<{ id: string; itemId: string; quantity: number; unitCostCents: number; totalCents: number; item: { name: string; sku: string; unit: string } }> }
export interface InventoryCountDto { id: string; code: string; status: string; notes: string | null; countedAt: string; createdBy: { name: string; email: string }; lines: Array<{ id: string; itemId: string; expectedQuantity: number; countedQuantity: number; difference: number; item: { name: string; sku: string; unit: string } }> }
export interface InventoryRecipeProductDto { id: string; name: string; recipe: { id: string; active: boolean; yieldQuantity: number; ingredients: Array<{ id: string; itemId: string; quantity: number; wastePercent: number; item: { id: string; name: string; sku: string; unit: string } }> } | null }
export interface InventoryData {
  items: InventoryItemDto[];
  movements: InventoryMovementDto[];
  purchases: InventoryPurchaseDto[];
  counts: InventoryCountDto[];
  products: InventoryRecipeProductDto[];
  sales: Array<{ id: string; code: string; createdAt: string; totalCents: number; hasInventory: boolean; inventoryReturned: boolean }>;
  topConsumption: Array<{ itemId: string; quantity: number; item: InventoryItemDto }>;
  metrics: { activeItems: number; totalStock: number; lowStock: number; outOfStock: number; valuationCents: number };
}

export interface BarberCustomerDto { id: string; name: string; dni: string | null; phone: string | null; email: string | null; notes: string | null; active: boolean; createdAt: string }
export interface StaffDto { id: string; name: string; phone: string | null; specialty: string | null; commissionPct: number; active: boolean; schedules: Array<{ weekday: number; startsAt: string; endsAt: string }> }
export interface ServiceDto { id: string; name: string; category: string | null; durationMinutes: number; priceCents: number; active: boolean }
export interface AppointmentDto { id: string; startsAt: string; endsAt: string; status: string; priceCents: number; notes: string | null; customer: { id: string; name: string; phone: string | null }; staff: { id: string; name: string }; service: { id: string; name: string }; paid: boolean }
export interface BarberSaleDto { id: string; code: string; paymentMethod: string; totalCents: number; createdAt: string; customer: string | null }
export interface BarbershopData {
  inventoryModule?: InventoryData;
  customers: BarberCustomerDto[];
  staff: StaffDto[];
  services: ServiceDto[];
  appointments: AppointmentDto[];
  sales: BarberSaleDto[];
  cashSession: { id: string; status: string; openingCents: number; expectedCents: number; openedAt: string } | null;
  metrics: { todayAppointments: number; confirmed: number; completed: number; todayRevenueCents: number; activeCustomers: number };
}

export interface RestaurantCategoryDto { id: string; name: string; active: boolean; preparationArea: { id: string; name: string } | null }
export interface RestaurantProductDto { id: string; name: string; description: string | null; priceCents: number; costCents: number; kitchenArea: string; productType: string; areaAssignmentMode: string; detectedAreaKey: string | null; active: boolean; category: { id: string; name: string }; preparationArea: { id: string; name: string } | null }
export interface PreparationAreaDto { id: string; name: string; normalizedKey: string | null; type: string; source: string; dispatchMode: string; active: boolean; printers: Array<{ id: string; printerId: string; name: string; copies: number; active: boolean }> }
export interface PrintDeviceDto { id: string; name: string; connectionType: string; paperWidthMm: number; automatic: boolean; active: boolean; tokenHint: string | null; lastSeenAt: string | null }
export interface RestaurantPrintSettingsDto { mode: "SIMPLE" | "ADVANCED"; automatic: boolean; defaultPrinterId: string | null; fields: string[] }
export interface RestaurantPromotionDto { id: string; name: string; code: string | null; kind: string; value: number; buyQuantity: number; freeQuantity: number; scope: string; categoryId: string | null; productId: string | null; minSubtotalCents: number; maxDiscountCents: number | null; automatic: boolean; weekdays: string; startTime: string | null; endTime: string | null; startsAt: string | null; endsAt: string | null; active: boolean }
export interface RestaurantOrderDto { id: string; code: string; source: string; deliveryPhone: string | null; deliveryAddress: string | null; deliveryReference: string | null; deliveryFeeCents: number; deliveryStatus: string | null; status: string; notes: string | null; subtotalCents: number; discountCents: number; totalCents: number; promotionName: string | null; promotionCode: string | null; createdAt: string; table: { id: string; name: string } | null; customer: { id: string; name: string } | null; waiter: { id: string; name: string }; items: Array<{ id: string; productId: string; parentProductId: string | null; productType: string; name: string; quantity: number; totalCents: number; status: string; notes: string | null }>; kitchenTicket: { id: string; status: string; createdAt: string } | null; paid: boolean }
export interface RestaurantTableDto { id: string; name: string; seats: number; status: string; active: boolean; qrToken: string | null; area: { id: string; name: string }; reservation: { name: string; phone: string | null; reservedAt: string | null; partySize: number | null; notes: string | null } | null; activeOrder: RestaurantOrderDto | null }
export interface RestaurantCatalogOption { key: string; label: string; active: boolean }
export interface RestaurantStatusOption extends RestaurantCatalogOption { terminal: boolean; allowedNext: string[] }
export interface RestaurantReadinessCheck { key: string; section: string; label: string; detail: string; status: "READY" | "WARNING" | "BLOCKED"; action: string }
export interface RestaurantReadiness { ready: boolean; score: number; checkedAt: string; checks: RestaurantReadinessCheck[]; blockers: RestaurantReadinessCheck[]; warnings: RestaurantReadinessCheck[] }
export interface RestaurantConfiguration {
  version: number;
  general: { orderPrefix: string; salePrefix: string; taxIncluded: boolean; taxRatePct: number; serviceChargePct: number; defaultLanguage: string };
  orders: { sources: RestaurantCatalogOption[]; statuses: RestaurantStatusOption[]; cancellationReasons: RestaurantCatalogOption[]; requireCancellationReason: boolean; allowItemNotes: boolean; allowAddItemsAfterKitchen: boolean };
  floor: { tableStatuses: RestaurantCatalogOption[]; defaultSeats: number; reservationsEnabled: boolean; reservationLeadMinutes: number; reservationToleranceMinutes: number; cleaningRequired: boolean };
  menu: { productTypes: RestaurantCatalogOption[]; requireCost: boolean; allowOutOfStockSales: boolean; showDescription: boolean; addonsEnabled: boolean };
  kitchen: { ticketStatuses: RestaurantStatusOption[]; warningMinutes: number; criticalMinutes: number; autoQueue: boolean; allowKitchenCancellation: boolean; requirePreparationArea: boolean };
  sales: { paymentMethods: RestaurantCatalogOption[]; requireOpenCash: boolean; splitPaymentsEnabled: boolean; maxDiscountPct: number; cashDifferenceToleranceCents: number; approvalRoleKeys: string[] };
  delivery: { enabled: boolean; statuses: RestaurantStatusOption[]; defaultFeeCents: number; requireCustomer: boolean; requirePhone: boolean; requireAddress: boolean };
  customers: { documentTypes: RestaurantCatalogOption[]; requireDocument: boolean; loyaltyEnabled: boolean; pointsPerCurrencyUnit: number; segments: RestaurantCatalogOption[] };
  inventory: { units: RestaurantCatalogOption[]; preventNegativeStock: boolean; autoDeductRecipes: boolean; lowStockAlerts: boolean; wasteReasons: RestaurantCatalogOption[] };
  promotions: { kinds: RestaurantCatalogOption[]; scopes: RestaurantCatalogOption[]; maxPercent: number; requireManagerApproval: boolean };
  notifications: { rules: Array<{ event: string; label: string; roleKeys: string[]; channels: string[]; active: boolean }> };
  integrations: { sunatEnabled: boolean; sunatProvider: "NUBEFACT"; sunatEnvironment: "BETA" | "PRODUCTION"; sunatAutoIssue: boolean; sunatInvoiceSeries: string; sunatReceiptSeries: string; deliveryProvider: string; deliveryEnabled: boolean; reservationsProvider: string; reservationsIntegrationEnabled: boolean; accountingProvider: string; accountingEnabled: boolean; webhookUrl: string };
  reports: { cutoffHour: number; includeCancelledOrders: boolean; defaultPeriod: "7d" | "30d" | "90d" | "12m" };
}
export interface RestaurantData {
  inventoryModule?: InventoryData;
  configuration: RestaurantConfiguration;
  paymentMethods: string[];
  categories: RestaurantCategoryDto[];
  products: RestaurantProductDto[];
  promotions: RestaurantPromotionDto[];
  preparationAreas: PreparationAreaDto[];
  printDevices: PrintDeviceDto[];
  printSettings: RestaurantPrintSettingsDto;
  areas: Array<{ id: string; name: string; active: boolean }>;
  tables: RestaurantTableDto[];
  customers: Array<{ id: string; name: string; dni: string | null; documentType: string | null; segment: string | null; loyaltyPoints: number; phone: string | null; email: string | null; notes: string | null; active: boolean }>;
  orders: RestaurantOrderDto[];
  kitchen: RestaurantOrderDto[];
  sales: Array<{ id: string; code: string; paymentMethod: string; payments: Array<{ id: string; method: string; amountCents: number; reference: string | null }>; electronicDocument: { id: string; kind: string; series: string; number: number; status: string; pdfUrl: string | null; xmlUrl: string | null; cdrUrl: string | null; lastError: string | null } | null; subtotalCents: number; discountCents: number; promotionName: string | null; totalCents: number; createdAt: string; orderCode: string | null; waiter: { id: string; name: string } | null; cashier: { id: string; name: string } | null }>;
  cashSession: { id: string; status: string; openingCents: number; expectedCents: number; openedAt: string; movements: Array<{ id: string; type: string; amountCents: number; reason: string; createdAt: string; createdBy: string }> } | null;
  metrics: { occupiedTables: number; reservedTables: number; cleaningTables: number; activeOrders: number; kitchenPending: number; todayRevenueCents: number };
  reports: RestaurantReportsData | null;
}
export type RestaurantReportPeriod = "7d" | "30d" | "90d" | "12m";
export interface RestaurantReportPoint { key: string; label: string; salesCents: number; orders: number }
export interface RestaurantReportsData {
  period: RestaurantReportPeriod;
  periodLabel: string;
  startAt: string;
  endAt: string;
  generatedAt: string;
  timezone: string;
  metrics: { salesCents: number; costCents: number; profitCents: number; marginPct: number; attentions: number; averageTicketCents: number; itemsSold: number; uniqueCustomers: number; repeatCustomers: number; cancelledOrders: number; cancellationRatePct: number };
  comparison: { salesPct: number | null; profitPct: number | null; attentionsPct: number | null; averageTicketPct: number | null };
  trend: { granularity: "day" | "week" | "month"; points: RestaurantReportPoint[] };
  salesByDay: RestaurantReportPoint[];
  salesByWeek: RestaurantReportPoint[];
  salesByMonth: RestaurantReportPoint[];
  salesByHour: Array<{ hour: number; label: string; salesCents: number; orders: number }>;
  salesByWeekday: Array<{ key: string; label: string; salesCents: number; orders: number }>;
  topProducts: Array<{ id: string; name: string; category: string; quantity: number; salesCents: number; profitCents: number }>;
  topCategories: Array<{ id: string; name: string; quantity: number; salesCents: number; sharePct: number }>;
  topCustomers: Array<{ id: string; name: string; dni: string | null; orders: number; salesCents: number; averageTicketCents: number }>;
  paymentMethods: Array<{ method: string; orders: number; salesCents: number; sharePct: number }>;
}

export interface TransportPageInfo {
  section: string;
  resource: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  query: string;
  status: string | null;
}

export interface TransportCatalogOption {
  key: string;
  label: string;
  active: boolean;
}

export interface TransportStatusOption extends TransportCatalogOption {
  terminal: boolean;
  allowedNext: string[];
}

export interface TransportDocumentRequirement extends TransportCatalogOption {
  ownerType: "DRIVER" | "VEHICLE" | "TRAILER" | "TRIP" | "COMPANY";
  required: boolean;
  expires: boolean;
  alertDays: number;
}

export interface TransportConfiguration {
  version: number;
  general: {
    operationPrefix: string;
    tripPrefix: string;
    maintenancePrefix: string;
    distanceUnit: string;
    weightUnit: string;
    volumeUnit: string;
    automaticNumbering: boolean;
  };
  operations: {
    serviceTypes: TransportCatalogOption[];
    tripStatuses: TransportStatusOption[];
    priorities: TransportCatalogOption[];
    trackingEvents: TransportCatalogOption[];
    requireRoute: boolean;
    requireCustomer: boolean;
  };
  customers: {
    partyTypes: TransportCatalogOption[];
    locationTypes: TransportCatalogOption[];
    operationConditions: TransportCatalogOption[];
    requireDistributionCenter: boolean;
    requireCostCenter: boolean;
  };
  fleet: {
    vehicleTypes: TransportCatalogOption[];
    trailerTypes: TransportCatalogOption[];
    vehicleStatuses: TransportCatalogOption[];
    assemblyRules: Array<{ tractorType: string; trailerTypes: string[]; maxTrailers: number; active: boolean }>;
    preventDuplicateAssignments: boolean;
    requireCompatibleAssembly: boolean;
    requireCapacityCheck: boolean;
  };
  drivers: {
    driverTypes: TransportCatalogOption[];
    driverStatuses: TransportCatalogOption[];
    licenseClasses: TransportCatalogOption[];
    workRegimes: Array<{ key: string; label: string; workDays: number; restDays: number; active: boolean }>;
    expiryAlertDays: number;
  };
  finance: {
    expenseCategories: TransportCatalogOption[];
    expenseStatuses: TransportCatalogOption[];
    paymentMethods: TransportCatalogOption[];
    approvalLimitCents: number;
    requireReceiptAboveCents: number;
    advancesEnabled: boolean;
    approvalRoleKeys: string[];
  };
  maintenance: {
    maintenanceTypes: TransportCatalogOption[];
    maintenanceStatuses: TransportCatalogOption[];
    inspectionTypes: TransportCatalogOption[];
    preventiveEveryKm: number;
    alertKmBefore: number;
    alertDaysBefore: number;
  };
  documents: {
    requirements: TransportDocumentRequirement[];
    blockAssignmentsWithExpiredDocuments: boolean;
    defaultAlertDays: number;
  };
  safety: {
    maxSpeedKph: number;
    maxContinuousDrivingHours: number;
    minRestHours: number;
    incidentTypes: TransportCatalogOption[];
    severities: TransportCatalogOption[];
    requireIncidentObservation: boolean;
  };
  notifications: {
    rules: Array<{ event: string; label: string; roleKeys: string[]; channels: string[]; active: boolean }>;
  };
  integrations: {
    gpsProvider: string;
    gpsEnabled: boolean;
    sapEnabled: boolean;
    sunatGreEnabled: boolean;
    mapsProvider: string;
    mapsEnabled: boolean;
    webhookUrl: string;
  };
  modules: {
    fuel: { targetKmPerLiter: number; requireInvoice: boolean; allowedVariancePct: number };
    tires: { minTreadMm: number; alertTreadMm: number; positions: TransportCatalogOption[] };
    inventory: { units: TransportCatalogOption[]; lowStockAlerts: boolean };
    reports: { cutoffHour: number; includeDraftTrips: boolean };
  };
}

export interface TransportData {
  inventoryModule?: InventoryData;
  configuration: TransportConfiguration;
  operations: Array<{ id: string; code: string; name: string; plannedStartAt: string; plannedEndAt: string; status: string; description: string | null; notes: string | null; customer: { id: string; legalName: string } | null; tripCount: number; pendingTrips: number; activeTrips: number; completedTrips: number }>;
  parties: Array<{ id: string; kind: string; documentType: string; documentNo: string; legalName: string; tradeName: string | null; contactName: string | null; phone: string | null; email: string | null; address: string | null; active: boolean }>;
  locations: Array<{ id: string; code: string; name: string; address: string | null; district: string | null; province: string | null; department: string | null; latitude: number | null; longitude: number | null; active: boolean }>;
  routes: Array<{ id: string; code: string; name: string; distanceKm: number; estimatedMinutes: number; tollEstimateCents: number; baseFreightCents: number; active: boolean; origin: { id: string; name: string }; destination: { id: string; name: string } }>;
  vehicles: Array<{ id: string; plate: string; brand: string; model: string; year: number; type: string; capacityKg: number | null; odometerKm: number; status: string; technicalDueAt: string | null; soatDueAt: string | null; gpsDeviceId: string | null; active: boolean }>;
  trailers: Array<{ id: string; plate: string; brand: string | null; model: string | null; type: string; capacityKg: number | null; status: string; active: boolean }>;
  drivers: Array<{ id: string; documentNo: string; firstName: string; lastName: string; fullName: string; type: string; phone: string | null; email: string | null; licenseNo: string; licenseClass: string; licenseDueAt: string; hireDate: string | null; workRegimeName: string; workDays: number; restDays: number; workCycleAnchor: string; status: string; active: boolean; scheduleToday: "WORK" | "REST"; leaves: Array<{ id: string; type: string; status: string; startsAt: string; endsAt: string; reason: string | null }>; workLogs: Array<{ id: string; workDate: string; scheduledType: string; clockInAt: string | null; clockOutAt: string | null; status: string; notes: string | null }> }>;
  trips: Array<{ id: string; code: string; operationId: string | null; operation: { id: string; code: string; name: string } | null; serviceType: string; cargoDescription: string; cargoWeightKg: number | null; scheduledStartAt: string; scheduledEndAt: string; actualStartAt: string | null; actualEndAt: string | null; status: string; priority: string; referenceNo: string | null; notes: string | null; freightCents: number; budgetCents: number; customer: { id: string; legalName: string }; route: { id: string; name: string; origin: { name: string }; destination: { name: string } }; assignments: Array<{ id: string; status: string; startsAt: string; endsAt: string; assignedAt: string; releasedAt: string | null; reason: string | null; driver: { id: string; firstName: string; lastName: string }; secondDriver: { id: string; firstName: string; lastName: string } | null; vehicle: { id: string; plate: string }; trailer: { id: string; plate: string } | null }>; trackingEvents: Array<{ id: string; type: string; recordedAt: string; latitude: number | null; longitude: number | null; odometerKm: number | null; description: string | null; source: string }>; incidents: Array<{ id: string; type: string; severity: string; status: string; occurredAt: string; description: string; resolution: string | null; resolvedAt: string | null }>; settlement: { id: string; incomeCents: number; expenseCents: number; balanceCents: number; status: string; closedAt: string | null } | null }>;
  documents: Array<{ id: string; ownerType: string; ownerId: string; type: string; number: string | null; issuedAt: string | null; expiresAt: string | null; status: string; fileUrl: string | null; fileName: string | null; fileSizeBytes: number | null; scanStatus: string | null; notes: string | null }>;
  expenses: Array<{ id: string; tripId: string | null; category: string; description: string; amountCents: number; occurredAt: string; status: string; receiptNo: string | null; trip: { code: string } | null }>;
  settlements: Array<{ id: string; tripId: string; incomeCents: number; expenseCents: number; balanceCents: number; status: string; closedAt: string | null; notes: string | null; trip: { code: string } }>;
  payments: Array<{ id: string; tripId: string | null; direction: string; partyType: string; partyId: string | null; category: string; amountCents: number; method: string; reference: string | null; status: string; paidAt: string; trip: { code: string } | null }>;
  fuelLogs: Array<{ id: string; tripId: string | null; vehicleId: string; loadedAt: string; station: string; liters: number; priceCents: number; totalCents: number; odometerKm: number; invoiceNo: string | null; status: string; vehicle: { plate: string }; trip: { code: string } | null }>;
  maintenanceOrders: Array<{ id: string; vehicleId: string; code: string; type: string; title: string; description: string | null; status: string; priority: string; scheduledAt: string | null; completedAt: string | null; odometerKm: number | null; estimatedCents: number; actualCents: number; vehicle: { plate: string } }>;
  maintenanceSummary: Array<{ vehicleId: string; plate: string; preventive: number; corrective: number; inspections: number; completed: number; open: number; totalCostCents: number; lastCompletedAt: string | null }>;
  inventory: Array<{ id: string; sku: string; name: string; unit: string; stock: number; minimumStock: number; unitCostCents: number; active: boolean }>;
  tires: Array<{ id: string; serialNo: string; brand: string; model: string | null; size: string; purchaseAt: string | null; purchaseCents: number; initialTreadMm: number | null; currentTreadMm: number | null; status: string; currentVehicleId: string | null; currentPosition: string | null; active: boolean; events: Array<{ id: string; vehicleId: string | null; type: string; position: string | null; treadMm: number | null; odometerKm: number | null; costCents: number; notes: string | null; occurredAt: string }> }>;
  metrics: { activeTrips: number; availableVehicles: number; availableDrivers: number; openIncidents: number; expiringDocuments: number; monthRevenueCents: number; monthExpenseCents: number; monthProfitCents: number; fleetUtilizationPct: number };
  pagination: TransportPageInfo | null;
}

export interface CoreTenantData {
  currentActorId: string;
  canResetPasswords: boolean;
  tenant: { id: string; name: string; shortName: string; slug: string; type: string; locale: string; currency: string; email: string | null; phone: string | null; address: string | null; publicWebsiteEnabled: boolean; publicSitePublished: boolean; publicSiteHeadline: string | null; publicSiteDescription: string | null; publicSitePrimaryColor: string; publicSiteWhatsapp: string | null; publicSiteInstagram: string | null };
  branches: Array<{ id: string; name: string; address: string | null; phone: string | null; active: boolean }>;
  roles: Array<{ id: string; key: string; name: string; permissions: string[] }>;
  users: Array<{ id: string; membershipId: string; name: string; email: string; roleId: string; roleName: string; roleKey: string; branchId: string | null; branchName: string | null; active: boolean }>;
  audit: Array<{ id: string; action: string; entityType: string; createdAt: string; actor: string | null }>;
}

export interface PlatformPlanView { id: string; key: string; name: string; description: string | null; monthlyPriceCents: number; maxUsers: number; maxMonthlyOperations: number; publicWebsiteEnabled: boolean; features: string[]; active: boolean; tenantCount: number }
export interface PlatformSetupView { status: "NOT_STARTED" | "DRAFT" | "READY"; currentStep: string; completedSteps: string[]; progress: number; templateKey: string | null; updatedAt: string | null; data: Record<string, unknown> }
export interface PlatformSetupTemplate { key: string; type: BusinessType; name: string; description: string; modules: string[]; preparationAreaSuggestions?: string[]; restaurantConfiguration?: RestaurantConfiguration; transportConfiguration?: TransportConfiguration }
export interface PlatformBusinessView { id: string; slug: string; name: string; shortName: string; type: BusinessType; status: string; country: string; currency: string; timezone: string; email: string | null; phone: string | null; address: string | null; branchName: string; createdAt: string; updatedAt: string; subscriptionStatus: string; subscriptionStartedAt: string; subscriptionEndsAt: string | null; trialEndsAt: string | null; cancelAtPeriodEnd: boolean; plan: PlatformPlanView | null; counts: { branches: number; users: number; customers: number; operations: number; sales: number }; monthlyRevenueCents: number; lastActivityAt: string | null; enabledModules: string[]; setup: PlatformSetupView }
export interface PlatformUserView { id: string; name: string; email: string; active: boolean; platformRole: string; createdAt: string; tenantCount: number }
export interface PlatformAuditView { id: string; action: string; entityType: string; entityId: string | null; metadata: string | null; createdAt: string; tenant: { id: string; name: string; slug: string }; user: { id: string; name: string; email: string } | null; branch: { id: string; name: string } | null }
export interface PlatformBillingData {
  configuration: { provider: string; configured: boolean; webhookConfigured: boolean; emailProvider: string; emailConfigured: boolean };
  metrics: { openCheckouts: number; paidInvoices: number; openInvoices: number; failedPayments: number; collectedCents: number; failedEvents: number; queuedEmails: number };
  checkouts: Array<{ id: string; email: string; businessName: string | null; businessSlug: string | null; status: string; provider: string; amountCents: number; currency: string; createdAt: string; expiresAt: string; planName: string; tenantSlug: string | null }>;
  invoices: Array<{ id: string; invoiceNumber: string | null; status: string; provider: string; amountDueCents: number; amountPaidCents: number; currency: string; createdAt: string; paidAt: string | null; businessName: string; planName: string | null }>;
  payments: Array<{ id: string; status: string; provider: string; amountCents: number; currency: string; createdAt: string; paidAt: string | null; failureMessage: string | null; businessName: string }>;
  events: Array<{ id: string; externalEventId: string; type: string; status: string; attempts: number; lastError: string | null; createdAt: string; businessName: string | null }>;
  emails: Array<{ id: string; recipient: string; template: string; status: string; attempts: number; createdAt: string; sentAt: string | null; businessName: string | null }>;
}
export interface PlatformData {
  currentTenantId: string;
  metrics: { totalBusinesses: number; activeBusinesses: number; trialBusinesses: number; suspendedBusinesses: number; activeSubscriptions: number; monthlyRecurringRevenueCents: number; monthlyOperations: number; monthlySalesCents: number };
  businesses: PlatformBusinessView[];
  plans: PlatformPlanView[];
  users: PlatformUserView[];
  audit: PlatformAuditView[];
  billing: PlatformBillingData;
  catalog: Array<{ key: string; name: string; description: string; businessCount: number; modules: string[]; color: string }>;
  system: { activeSessions: number; auditEvents: number; queuedJobs: number; processingJobs: number; failedJobs: number; staleJobs: number; storedObjects: number; storedBytes: number; storageProvider: string; generatedAt: string };
  setupTemplates: PlatformSetupTemplate[];
}

export interface SessionContextResponse { session: AuthSessionView; branches: BranchSummary[]; businesses: BusinessAccessSummary[] }
export type TenantWorkspaceResponse = SessionContextResponse & ({ industry: "barbershop"; data: BarbershopData; core: CoreTenantData } | { industry: "restaurant"; data: RestaurantData; core: CoreTenantData } | { industry: "transport"; data: TransportData; core: CoreTenantData });
export interface PlatformWorkspaceResponse extends SessionContextResponse { data: PlatformData }
export interface ApiErrorPayload { error: { code: string; message: string; details?: unknown } }
export interface OperationalNotification {
  id: string;
  tone: "info" | "warning" | "critical";
  title: string;
  message: string;
  href: string;
}
export interface OperationalNotificationsResponse { items: OperationalNotification[]; total: number; generatedAt: string }
