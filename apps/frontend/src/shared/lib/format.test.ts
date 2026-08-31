import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCurrency,
  formatCurrencyCents,
  formatDateInput,
  formatDateTime,
  formatDateTimeInput,
  formatShortDate,
  formatTime,
} from "./format";

test("las fechas se representan de forma determinista en la zona horaria de Lima", () => {
  const instant = "2030-01-15T19:07:00.000Z";

  assert.equal(formatDateInput(instant), "2030-01-15");
  assert.equal(formatDateTimeInput(instant), "2030-01-15T14:07");
  assert.equal(formatTime(instant), "14:07");
  assert.equal(formatShortDate(instant), "15 ene");
  assert.equal(formatShortDate(instant, true), "15 ene 2030");
  assert.equal(formatDateTime(instant), "15/01/2030, 14:07");
});

test("los importes usan un formato estable para soles", () => {
  assert.equal(formatCurrency(1234), "S/ 1,234");
  assert.equal(formatCurrency(-1234), "S/ -1,234");
  assert.equal(formatCurrencyCents(123456), "S/ 1,234.56");
});
