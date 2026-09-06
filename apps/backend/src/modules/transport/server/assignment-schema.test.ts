import assert from "node:assert/strict";
import test from "node:test";
import { assignmentSchema, resourcePresetSchema, trailerCouplingSchema } from "./command-schemas";

test("trip assignment requires a previously prepared assembly", () => {
  assert.equal(assignmentSchema.safeParse({ presetId: "preset-1", reason: "Plan diario" }).success, true);
  assert.equal(assignmentSchema.safeParse({ vehicleId: "vehicle-1", driverId: "driver-1" }).success, false);
});

test("prepared assemblies reject repeated trailers and drivers", () => {
  const base = { name: "Unidad norte", vehicleId: "vehicle-1", scopeType: "TENANT" as const };
  assert.equal(resourcePresetSchema.safeParse({ ...base, trailerIds: ["trailer-1", "trailer-1"], driverIds: ["driver-1"] }).success, false);
  assert.equal(resourcePresetSchema.safeParse({ ...base, trailerIds: ["trailer-1"], driverIds: ["driver-1", "driver-1"] }).success, false);
  assert.equal(resourcePresetSchema.safeParse({ ...base, trailerIds: ["trailer-1"], driverIds: ["driver-1", "driver-2"] }).success, true);
});

test("fixed trailer couplings require distinct plates and cannot mix with individual trailers", () => {
  assert.equal(trailerCouplingSchema.safeParse({ name: "Bitrén fijo", trailerIds: ["trailer-1", "trailer-2"] }).success, true);
  assert.equal(trailerCouplingSchema.safeParse({ name: "Bitrén fijo", trailerIds: ["trailer-1", "trailer-1"] }).success, false);
  assert.equal(resourcePresetSchema.safeParse({ name: "Unidad fija", vehicleId: "vehicle-1", couplingId: "coupling-1", trailerIds: [], driverIds: ["driver-1"] }).success, true);
  assert.equal(resourcePresetSchema.safeParse({ name: "Unidad inválida", vehicleId: "vehicle-1", couplingId: "coupling-1", trailerIds: ["trailer-3"], driverIds: ["driver-1"] }).success, false);
});
