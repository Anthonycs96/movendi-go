import assert from "node:assert/strict";
import test from "node:test";
import { addDays, maintenanceCycleKey, maintenanceDueState, planMatchesVehicle } from "./maintenance-planning";

test("marca un mantenimiento vencido cuando alcanza kilómetros o fecha", () => {
  assert.equal(maintenanceDueState({ vehicleOdometerKm: 120_000, nextDueKm: 120_000, nextDueAt: null, alertKmBefore: 1_000, alertDaysBefore: null }).state, "DUE");
  assert.equal(maintenanceDueState({ vehicleOdometerKm: 10, nextDueKm: null, nextDueAt: new Date("2026-09-01T00:00:00Z"), alertKmBefore: null, alertDaysBefore: 10, now: new Date("2026-09-02T00:00:00Z") }).state, "DUE");
});

test("avisa antes del vencimiento sin adelantarlo", () => {
  const state = maintenanceDueState({ vehicleOdometerKm: 119_200, nextDueKm: 120_000, nextDueAt: null, alertKmBefore: 1_000, alertDaysBefore: null });
  assert.equal(state.state, "UPCOMING");
  assert.match(state.reason ?? "", /800 km/);
});

test("una orden abierta identifica la programación como atendida", () => {
  assert.equal(maintenanceDueState({ vehicleOdometerKm: 120_000, nextDueKm: 120_000, nextDueAt: null, alertKmBefore: 1_000, alertDaysBefore: null, hasOpenOrder: true }).state, "ORDERED");
});

test("valida alcance de marca, modelo, año y tipo", () => {
  const plan = { brand: "Scania", model: "R450", yearFrom: 2022, yearTo: 2026, vehicleType: "TRACTOR" };
  assert.equal(planMatchesVehicle(plan, { brand: "SCANIA", model: "r450", year: 2025, type: "TRACTOR" }), true);
  assert.equal(planMatchesVehicle(plan, { brand: "Volvo", model: "FH", year: 2025, type: "TRACTOR" }), false);
});

test("calcula la siguiente fecha sin compartir referencias mutables", () => {
  const base = new Date("2026-01-01T00:00:00Z");
  assert.equal(addDays(base, 30)?.toISOString(), "2026-01-31T00:00:00.000Z");
  assert.equal(addDays(base, null), null);
  assert.equal(base.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("crea una clave idempotente distinta para cada ciclo", () => {
  const first = maintenanceCycleKey({ id: "schedule-1", nextDueKm: 10_000, nextDueAt: null });
  const next = maintenanceCycleKey({ id: "schedule-1", nextDueKm: 20_000, nextDueAt: null });
  assert.notEqual(first, next);
  assert.equal(first, maintenanceCycleKey({ id: "schedule-1", nextDueKm: 10_000, nextDueAt: null }));
});
