import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import type { AxeResults } from "axe-core";

const require = createRequire(resolve("package.json"));
for (const [width, theme] of [[1366, "light"], [768, "light"], [390, "light"], [1366, "dark"]] as const) {
  test(`formularios de restaurante accesibles a ${width}px ${theme}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(mode => localStorage.setItem("saas-v2-theme-mode", mode), theme);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    expect((await page.request.post("/api/auth/login", { data: { email: "admin@brasa.local", password: "Nexo2026!", businessSlug: "brasa-norte" } })).ok()).toBe(true);
    await mkdir("outputs/restaurant-ux", { recursive: true });
    for (const [route, button] of [["menu", "Editar"], ["promotions", "Nueva promoción"], ["clients", "Nuevo cliente"], ["checkout", "Cerrar caja"]]) {
      await page.goto(`/t/brasa-norte/${route}`);
      const trigger = route === "menu" ? page.getByRole("row").filter({ hasText: "Chicha morada" }).getByRole("button", { name: "Editar", exact: true }) : page.getByRole("button", { name: button, exact: true }).first();
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.evaluate(async () => { await Promise.allSettled(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished)); });
      await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (context: Element, options: unknown) => Promise<AxeResults> } }).axe;
        return (await axe.run(document.querySelector('[role="dialog"]')!, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }));
      });
      expect(violations, route).toEqual([]);
      await page.screenshot({ path: `outputs/restaurant-ux/${route}-modal-${width}-${theme}.png`, animations: "disabled" });
      await dialog.press("Escape");
      await expect(dialog).not.toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
