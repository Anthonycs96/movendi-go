import assert from "node:assert/strict";
import test from "node:test";
import { reportCsvCell } from "./report-csv";

test("export escapes names, commas and spreadsheet formulas without changing numeric amounts", () => {
  assert.equal(reportCsvCell('Pollo "especial", grande'), '"Pollo ""especial"", grande"');
  assert.equal(reportCsvCell("=HYPERLINK(1)"), '"\'=HYPERLINK(1)"');
  assert.equal(reportCsvCell(" \t@SUM(1)"), '"\' \t@SUM(1)"');
  assert.equal(reportCsvCell("-12.50"), '"-12.50"');
});
