import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const areas = [
  { slug: "nova-studio", sections: ["dashboard", "appointments", "clients", "team", "services", "checkout", "settings"] },
  { slug: "brasa-norte", sections: ["dashboard", "floor", "kitchen", "clients", "menu", "checkout", "reports", "settings"] },
  { slug: "andes-cargo", sections: ["dashboard", "operations", "fleet", "drivers", "finance", "reports", "settings"] },
  { slug: "platform", sections: ["dashboard", "businesses", "plans", "billing", "users", "audit", "settings"] },
];

for (const area of areas) test(`rendimiento y navegación: ${area.slug}`, async ({ page }, info) => {
  test.setTimeout(180_000);
  const login = await page.request.post("/api/auth/login", { data: { email: "superadmin@multisaas.local", password: "Nexo2026!", businessSlug: area.slug === "platform" ? "brasa-norte" : area.slug } });
  expect(login.ok()).toBe(true);
  const prefix = area.slug === "platform" ? "/platform" : `/t/${area.slug}`;
  const requests: string[] = [];
  page.on("request", (request) => { if (request.resourceType() === "script") requests.push(request.url()); });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${prefix}/dashboard`);
  await expect(page.locator("h1")).toBeVisible();
  const initialScriptBytes = await page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => (entry as PerformanceResourceTiming).initiatorType === "script").reduce((total, entry) => total + (entry as PerformanceResourceTiming).decodedBodySize, 0));
  const measurements = [];
  for (const section of area.sections) {
    const apiPath = area.slug === "platform" ? `/api/data/platform?section=${section}` : `/api/data/tenant?section=${section}`;
    const samples = [];
    let bytes = 0;
    for (let sample = 0; sample < 3; sample++) {
      const start = Date.now();
      const response = await page.request.get(apiPath);
      expect(response.ok(), await response.text()).toBe(true);
      bytes = (await response.body()).length;
      samples.push(Date.now() - start);
    }
    const link = page.locator(`a[href="${prefix}/${section}"]:visible`).first();
    const start = Date.now();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/${section}$`));
    await expect(page.locator(".route-loading")).toHaveCount(0);
    await expect(page.locator("h1")).toBeVisible();
    measurements.push({ section, bytes, apiMedianMs: samples.sort((a, b) => a - b)[1], navigationMs: Date.now() - start });
  }
  expect(errors).toEqual([]);
  const scriptBytes = await page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => (entry as PerformanceResourceTiming).initiatorType === "script").reduce((total, entry) => total + (entry as PerformanceResourceTiming).decodedBodySize, 0));
  const result = { area: area.slug, initialScriptBytes, scriptRequests: new Set(requests).size, scriptBytes, measurements };
  await mkdir("outputs/app-performance", { recursive: true });
  await writeFile(`outputs/app-performance/${process.env.APP_MEASUREMENT ?? "after"}-${area.slug}.json`, JSON.stringify(result, null, 2));
  await info.attach("performance.json", { body: JSON.stringify(result), contentType: "application/json" });
});
