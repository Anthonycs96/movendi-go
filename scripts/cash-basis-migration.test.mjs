import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

test("cash migration preserves historic amounts and marks only existing barber sessions", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE Tenant (id TEXT PRIMARY KEY, type TEXT); CREATE TABLE CashSession (id TEXT PRIMARY KEY, tenantId TEXT, status TEXT, openingCents INTEGER, expectedCents INTEGER, countedCents INTEGER);
      INSERT INTO Tenant VALUES ('barber', 'BARBERSHOP'), ('restaurant', 'RESTAURANT');
      INSERT INTO CashSession VALUES ('legacy-open', 'barber', 'OPEN', 100, 500, NULL), ('legacy-closed', 'barber', 'CLOSED', 100, 600, 590), ('restaurant-open', 'restaurant', 'OPEN', 50, 50, NULL);`);
    const before = db.prepare("SELECT * FROM CashSession ORDER BY id").all();
    const sql = readFileSync("apps/backend/prisma/migrations/20260913040000_cash_balance_basis/migration.sql", "utf8");
    assert.equal(sql, readFileSync("apps/backend/prisma/postgresql/migrations/20260913040000_cash_balance_basis/migration.sql", "utf8"));
    db.exec(sql);
    const after = db.prepare("SELECT * FROM CashSession ORDER BY id").all();
    assert.deepEqual(after.map(({ balanceBasis, ...row }) => { assert.equal(balanceBasis, row.tenantId === "barber" ? "ALL_PAYMENTS" : "CASH_ONLY"); return { ...row }; }), before.map((row) => ({ ...row })));
    db.exec("INSERT INTO CashSession (id, tenantId, status, openingCents, expectedCents) VALUES ('new', 'barber', 'OPEN', 50, 50)");
    assert.equal(db.prepare("SELECT balanceBasis FROM CashSession WHERE id = 'new'").get().balanceBasis, "CASH_ONLY");
  } finally { db.close(); }
});
