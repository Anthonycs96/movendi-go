import { test } from "node:test";
import assert from "node:assert/strict";
import { restaurantBusinessDay } from "./business-day";

test("la medianoche UTC pertenece al día anterior en Lima", () => {
  const day = restaurantBusinessDay(new Date("2026-09-07T01:00:00Z"), "America/Lima");
  assert.equal(day.start.toISOString(), "2026-09-06T05:00:00.000Z");
  assert.equal(day.end.toISOString(), "2026-09-07T05:00:00.000Z");
});

test("el cierre de madrugada conserva las ventas en la jornada anterior", () => {
  const day = restaurantBusinessDay(new Date("2026-09-07T07:00:00Z"), "America/Lima", 4);
  assert.equal(day.start.toISOString(), "2026-09-06T09:00:00.000Z");
  assert.equal(day.end.toISOString(), "2026-09-07T09:00:00.000Z");
});

test("el día civil ajusta su duración al cambio horario", () => {
  const day = restaurantBusinessDay(new Date("2026-03-08T17:00:00Z"), "America/New_York");
  assert.equal(day.start.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(day.end.toISOString(), "2026-03-09T04:00:00.000Z");
});
