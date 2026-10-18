/**
 * ADM-09 accessibility: axe (`@axe-core/playwright`, WCAG 2.x A/AA rules) on every admin route in
 * EN and RW — zero serious / critical violations — plus the sign-in, 403 and 404 pages, and the
 * landmarks / skip link of the shell.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "./helpers.ts";

const ROUTES = [
  "/admin/overview",
  "/admin/funnel",
  "/admin/funnel/reviewed",
  "/admin/timeliness",
  "/admin/workload",
  "/admin/quality",
  "/admin/reports?template=programme_summary",
  "/admin/governance?tab=rulesets",
  "/admin/governance?tab=audit",
  "/admin/governance?tab=access",
  "/admin/governance?tab=roles",
  "/admin/settings",
  "/admin/overview?district=dist-beta",
  "/admin/nowhere", // 404
];

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const language of ["en", "rw"] as const) {
  test(`axe: every admin route has no serious / critical violations (${language})`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto("/admin/login");
    expect(await seriousViolations(page), "/admin/login").toEqual([]);
    await signInAs(page, /Vaqvox Varqezo/, /All districts in my scope/);
    if (language === "rw") {
      await page.getByRole("banner").getByRole("button", { name: "Ikinyarwanda" }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", "rw");
    }
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.waitForTimeout(400);
      expect(await seriousViolations(page), route).toEqual([]);
    }
  });
}

test("analyst 403 page, landmarks and skip link", async ({ page }) => {
  await page.goto("/admin/overview?district=dist-beta");
  await signInAs(page, /Quavel Quoriqua/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Outside your authorised scope" }),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("complementary").first()).toBeAttached();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});
