import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarReportPoints } from "./report-series";

test("las ventas de hoy se rotulan con la fecha local y se separan en medianoche", () => {
  const now = new Date("2026-09-07T12:00:00Z");
  const points = calendarReportPoints([
    { createdAt: new Date("2026-09-07T04:59:59Z"), totalCents: 100 },
    { createdAt: new Date("2026-09-07T05:00:00Z"), totalCents: 200 },
    { createdAt: new Date("2026-09-07T11:00:00Z"), totalCents: 300 },
    { createdAt: new Date("2026-09-07T13:00:00Z"), totalCents: 900 },
  ], now, 7, 1, "America/Lima");
  assert.equal(points.length, 7);
  assert.match(points.at(-1)!.label, /^07[ -]/);
  assert.equal(points.at(-1)?.key, "2026-09-07T05:00:00.000Z");
  assert.equal(points.at(-1)?.salesCents, 500);
  assert.equal(points.at(-2)?.salesCents, 100);
  assert.equal(points.reduce((sum, point) => sum + point.salesCents, 0), 600);
});

test("los intervalos diarios conservan medianoches locales durante el cambio horario", () => {
  const points = calendarReportPoints([
    { createdAt: new Date("2026-03-09T03:59:59Z"), totalCents: 100 },
    { createdAt: new Date("2026-03-09T04:00:00Z"), totalCents: 200 },
  ], new Date("2026-03-09T12:00:00Z"), 2, 1, "America/New_York");
  assert.deepEqual(points.map((point) => [point.key, point.salesCents]), [
    ["2026-03-08T05:00:00.000Z", 100], ["2026-03-09T04:00:00.000Z", 200],
  ]);
});

test("los intervalos semanales no duplican ventas en sus límites", () => {
  const points = calendarReportPoints([
    { createdAt: new Date("2026-09-01T04:59:59Z"), totalCents: 100 },
    { createdAt: new Date("2026-09-01T05:00:00Z"), totalCents: 200 },
  ], new Date("2026-09-07T12:00:00Z"), 2, 7, "America/Lima");
  assert.deepEqual(points.map((point) => point.salesCents), [100, 200]);
});
