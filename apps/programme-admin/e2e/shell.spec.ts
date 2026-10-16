/**
 * FND-11 shell gate in a real browser (Chromium): banner on every route, EN ⇄ RW persisted
 * across reload with `<html lang>`, Offline banner, Reset demo, no axe violations on the shell.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("admin shell: banner, language persistence, demo tools", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/admin\/overview$/);
  const banner = page.getByTestId("demo-banner");
  await expect(banner).toContainText(
    "DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE",
  );

  await page.getByRole("button", { name: "Ikinyarwanda" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "rw");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "rw");
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.goto("/admin/reports");
  await expect(banner).toBeVisible();
  await page.getByRole("button", { name: "Demo tools" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Offline" }).click();
  await expect(page.getByText("You are offline. Changes are saved on this device.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Demo tools" }).click();
  await page.getByRole("menuitem", { name: "Reset demo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("Demo data was reset to the baseline.")).toBeVisible();
  await expect(page.getByText("You are offline. Changes are saved on this device.")).toBeHidden();

  const results = await new AxeBuilder({ page }).include("[data-testid=app-shell]").analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});
