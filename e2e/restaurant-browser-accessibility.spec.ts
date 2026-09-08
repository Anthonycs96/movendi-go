import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import type { AxeResults } from "axe-core";

const require = createRequire(import.meta.url);
for (const viewport of [{ width: 1366, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`restaurante accesible y adaptable ${viewport.width}px`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => { if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto("/login");
    await page.getByLabel("Negocio", { exact: true }).fill("brasa-norte");
    await page.getByLabel(/Correo electrónico/).fill("admin@brasa.local");
    await page.getByLabel("Contraseña", { exact: true }).fill("Nexo2026!");
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page).toHaveURL(/\/t\/brasa-norte\//);
    const violations: Array<{ route: string; id: string; impact: string | null | undefined; targets: unknown }> = [];
    for (const route of ["dashboard", "kitchen", "orders", "checkout", "settings", "reports"]) {
      await page.goto(`/t/brasa-norte/${route}`);
      await expect(page.locator("h1")).toBeVisible();
      if (["orders", "checkout"].includes(route)) await expect(page.getByRole("status", { name: "" }).filter({ hasText: "Cargando historial" })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${route}: sin desbordamiento horizontal`).toBe(true);
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const result = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<AxeResults> } }).axe;
        return axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      });
      violations.push(...result.violations.map((item) => ({ route, id: item.id, impact: item.impact, targets: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })));
      if (["kitchen", "checkout"].includes(route)) await page.screenshot({ path: info.outputPath(`${route}-${viewport.width}.png`), fullPage: true });
    }
    await page.goto("/t/brasa-norte/clients");
    const trigger = page.getByRole("button", { name: "Nuevo cliente", exact: true });
    await trigger.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
    await info.attach("accessibility.json", { contentType: "application/json", body: JSON.stringify(violations, null, 2) });
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
