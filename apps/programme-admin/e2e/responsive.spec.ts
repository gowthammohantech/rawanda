/**
 * ADM-09 responsive layout: at 1440 / 1280 / 1024 / 768 / 390 px every admin page has no
 * page-level horizontal scroll (`documentElement.scrollWidth <= innerWidth`) in EN and RW, a
 * full-page screenshot is kept per width, and the navigation is reachable by keyboard at every
 * width (sidebar ≥ 1024, icon rail at 768, menu button → drawer at 390). At 390 the filters sit
 * behind "Filters (n)" and tables become stacked cards.
 */
import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "./helpers.ts";

const WIDTHS = [1440, 1280, 1024, 768, 390] as const;
const ROUTES = [
  "/admin/overview",
  "/admin/funnel",
  "/admin/funnel/reviewed",
  "/admin/timeliness",
  "/admin/workload",
  "/admin/quality",
  "/admin/reports?template=programme_summary",
  "/admin/governance?tab=audit",
  "/admin/governance?tab=access",
  "/admin/governance?tab=roles",
  "/admin/settings",
];

async function noHorizontalScroll(page: Page, label: string) {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(scrollWidth, label).toBeLessThanOrEqual(innerWidth);
}

for (const language of ["en", "rw"] as const) {
  test(`no page-level horizontal scroll at any width (${language})`, async ({ page }, info) => {
    test.setTimeout(300_000);
    await page.goto("/admin/login");
    await signInAs(page, /Vaqvox Varqezo/, /All districts in my scope/);
    if (language === "rw") {
      await page.getByRole("banner").getByRole("button", { name: "Ikinyarwanda" }).click();
    }
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.locator("main h1").first()).toBeVisible();
        await page.waitForTimeout(250);
        await noHorizontalScroll(page, `${language} ${route} @${width}`);
      }
      await page.goto("/admin/overview");
      await expect(page.getByTestId("kpi-strip")).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`overview-${language}-${width}.png`),
        fullPage: true,
      });
    }
  });
}

test("navigation is reachable by keyboard at every width; 390 px filter sheet and cards", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await signInAs(page, /Quavel Quoriqua/);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/overview");
    await expect(page.getByTestId("kpi-strip")).toBeVisible();
    if (width >= 1024) {
      const link = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", {
        name: "Timeliness",
      });
      await link.focus();
      await expect(link).toBeFocused();
      await page.keyboard.press("Enter");
    } else if (width >= 768) {
      const rail = page.getByRole("navigation", { name: "Navigation shortcuts" });
      await expect(rail).toBeVisible();
      const link = rail.getByRole("link", { name: "Timeliness" });
      await link.focus();
      await page.keyboard.press("Enter");
    } else {
      await expect(page.getByTestId("icon-rail")).toBeHidden();
      const menu = page.getByRole("button", { name: "Open navigation menu" });
      await menu.focus();
      await page.keyboard.press("Enter");
      const drawerNav = page.getByRole("dialog").getByRole("navigation");
      await expect(drawerNav).toBeVisible();
      const link = drawerNav.getByRole("link", { name: "Timeliness" });
      await link.focus();
      await page.keyboard.press("Enter");
    }
    await expect(page).toHaveURL(/\/admin\/timeliness/);
  }

  // 390: filters behind "Filters (n)", KPI strip 2 columns, stacked table cards.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/admin/workload?preset=30d");
  const toggle = page.getByTestId("filters-toggle");
  await expect(toggle).toHaveText("Filters (1)");
  await expect(page.getByLabel("Date range")).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Date range")).toBeVisible();
  const header = page.getByTestId("worker-table").locator("thead");
  await expect(header).toHaveCSS("position", "absolute"); // sr-only header row: stacked cards
});
