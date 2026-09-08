import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

test("mide navegación y carga de cada pantalla del restaurante", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { email: "superadmin@multisaas.local", password: "Nexo2026!", businessSlug: "brasa-norte" } });
  expect(login.ok()).toBe(true);
  const measurements = [];
  await page.goto("/t/brasa-norte/dashboard");
  for (const section of ["dashboard", "kitchen", "clients", "menu", "checkout", "reports"]) {
    const api = await page.request.get(`/api/data/tenant?section=${section}`);
    expect(api.ok()).toBe(true);
    const bytes = (await api.body()).length;
    const link = page.locator(`.desktop-sidebar a.sidebar__item[href="/t/brasa-norte/${section}"]`);
    const started = Date.now();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/${section}$`));
    await expect(page.locator("h1")).toBeVisible();
    measurements.push({ section, bytes, serverTiming: api.headers()["server-timing"], navigationMs: Date.now() - started });
  }
  await mkdir("outputs/shell-review", { recursive: true });
  await writeFile(`outputs/shell-review/performance-${process.env.SHELL_MEASUREMENT ?? "after"}.json`, JSON.stringify(measurements, null, 2));
});
