import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import type { AxeResults } from "axe-core";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(resolve("package.json"));
async function navigate(page: Page, route: string) {
  const path = `/t/brasa-norte/${route}`;
  if (new URL(page.url()).pathname !== path) {
    const link = page.locator(`.sidebar a.sidebar__item[href="${path}"]:visible`);
    if (!await link.isVisible()) await page.getByRole("button", { name: "Abrir navegación", exact: true }).click();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
  await expect(page.locator("h1")).toBeVisible();
}
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
    for (const theme of info.project.name === "chromium" && viewport.width === 1366 ? ["light", "dark"] : ["light"]) {
    if (theme === "dark") {
      await page.locator(".sidebar").hover();
      await page.getByRole("button", { name: /^Tema:/ }).click();
      await page.getByRole("menuitemradio", { name: /Oscuro/ }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
    }
    for (const route of ["dashboard", "kitchen", "orders", "checkout", "settings", "reports"]) {
      console.log(`${info.project.name} ${viewport.width} ${theme}/${route}`);
      await navigate(page, route);
      await expect(page.locator("h1")).toBeVisible();
      if (["orders", "checkout"].includes(route)) await expect(page.getByRole("status", { name: "" }).filter({ hasText: "Cargando historial" })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${route}: sin desbordamiento horizontal`).toBe(true);
      if (route === "checkout" && viewport.width === 390) {
        const table = page.getByRole("region", { name: "Tabla desplazable", exact: true }).first();
        await table.focus(); await page.keyboard.press("ArrowRight");
        await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      }
      await page.evaluate(async () => { await Promise.allSettled(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished)); });
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const result = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<AxeResults> } }).axe;
        return axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      });
      violations.push(...result.violations.map((item) => ({ route: `${theme}/${route}`, id: item.id, impact: item.impact, targets: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })));
      if (["kitchen", "checkout"].includes(route)) {
        await mkdir("outputs/restaurant-browser-review", { recursive: true });
        await page.screenshot({ path: resolve("outputs/restaurant-browser-review", `${info.project.name}-${theme}-${route}-${viewport.width}.png`), fullPage: true });
      }
    }
    }
    await navigate(page, "clients");
    const trigger = page.getByRole("button", { name: "Nuevo cliente", exact: true });
    await trigger.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
    await info.attach("accessibility.json", { contentType: "application/json", body: JSON.stringify(violations, null, 2) });
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
