import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRestaurantArea, normalizeRestaurantCatalogLabel } from "@movendi/contracts";

test("unifica variaciones singulares, plurales y de mayúsculas de un área", () => {
  for (const value of ["Cocina", "cocinas", " COCINA ", "Kitchen", "kitchens"]) {
    const normalized = normalizeRestaurantArea(value);
    assert.equal(normalized?.key, "KITCHEN");
    assert.equal(normalized?.name, "Cocina");
    assert.equal(normalized?.type, "KITCHEN");
  }

  for (const value of ["Bar", "barras", " BARRA "]) {
    const normalized = normalizeRestaurantArea(value);
    assert.equal(normalized?.key, "BAR");
    assert.equal(normalized?.name, "Bar");
    assert.equal(normalized?.type, "BAR");
  }
});

test("genera una clave estable para categorías aunque cambien tildes, espacios o mayúsculas", () => {
  assert.equal(normalizeRestaurantCatalogLabel("  Bebidas   frías ").key, "BEBIDAS FRIAS");
  assert.equal(normalizeRestaurantCatalogLabel("bebidas frias").key, "BEBIDAS FRIAS");
  assert.equal(normalizeRestaurantCatalogLabel("  Bebidas   frías ").name, "Bebidas frías");
});
