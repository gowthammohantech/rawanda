/**
 * ADM-09 i18n: the language choice survives a reload (stored by `@laif/i18n`), `<html lang>`
 * follows it, Settings confirms the save, and the language never changes a number (the KPI
 * figures are identical in EN and RW). The missing-key fallback (RW → EN + dev warning) is
 * unit-tested in `src/test/i18n.test.ts`.
 */
import { expect, test } from "@playwright/test";

import { signInAs } from "./helpers.ts";

const digits = (text: string | null) => (text ?? "").match(/[<\d][\d.,]*/g) ?? [];

test("RW persists across reload; figures are identical in EN and RW", async ({ page }) => {
  await page.goto("/admin/overview");
  await signInAs(page, /Quavel Quoriqua/);
  const strip = page.getByTestId("kpi-strip");
  await expect(strip).toBeVisible();
  const en = digits(await strip.innerText());

  await page.goto("/admin/settings");
  await page.getByTestId("language-setting").getByRole("button", { name: "Ikinyarwanda" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "rw");
  await expect(page.getByTestId("language-saved")).toContainText("Byabitswe");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "rw");
  await expect(page.getByRole("heading", { level: 1, name: "Igenamiterere" })).toBeVisible();

  await page.goto("/admin/overview");
  await expect(strip).toBeVisible();
  expect(digits(await strip.innerText())).toEqual(en);
  await expect(page).toHaveTitle(/Imbonerahamwe ya Porogaramu · CareConnect \(Igerageza\)$/);
});
