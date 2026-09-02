-- SQLite stores historical DateTime values as epochs, so derive the issuance year from immutable codes.
INSERT OR IGNORE INTO "TransportSequence" ("id", "tenantId", "branchId", "kind", "year", "prefix", "nextNumber", "createdAt", "updatedAt")
SELECT 'seq_trip_code_' || "tenantId" || '_' || "branchId" || '_' || CAST(substr("code", instr("code", '-') + 1, 4) AS INTEGER), "tenantId", "branchId", 'TRIP', CAST(substr("code", instr("code", '-') + 1, 4) AS INTEGER), substr("code", 1, instr("code", '-') - 1), MAX(CAST(replace(substr("code", -6), '-', '') AS INTEGER)) + 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TransportTrip" WHERE instr("code", '-') > 0 GROUP BY "tenantId", "branchId", CAST(substr("code", instr("code", '-') + 1, 4) AS INTEGER);

INSERT OR IGNORE INTO "TransportSequence" ("id", "tenantId", "branchId", "kind", "year", "prefix", "nextNumber", "createdAt", "updatedAt")
SELECT 'seq_operation_code_' || "tenantId" || '_' || "branchId" || '_' || CAST(substr("code", instr("code", '-') + 1, 4) AS INTEGER), "tenantId", "branchId", 'OPERATION', CAST(substr("code", instr("code", '-') + 1, 4) AS INTEGER), substr("code", 1, instr("code", '-') - 1), MAX(CAST(replace(substr("code", -6), '-', '') AS INTEGER)) + 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TransportOperation" WHERE instr("code", '-') > 0 GROUP BY "tenantId", "branchId", CAST(substr("code", instr("code", '-') + 1, 4) AS INTEGER);
