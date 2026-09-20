-- Preserve existing retail categories, including categories used only by inactive products.
INSERT INTO "Category" ("id", "tenantId", "branchId", "name", "active", "createdAt")
SELECT 'retail-category:' || MIN(p."id"), p."tenantId", p."branchId", p."category", true, CURRENT_TIMESTAMP
FROM "RetailProduct" p
WHERE NOT EXISTS (
  SELECT 1 FROM "Category" c
  WHERE c."tenantId" = p."tenantId" AND c."branchId" = p."branchId" AND c."name" = p."category"
)
GROUP BY p."tenantId", p."branchId", p."category";
