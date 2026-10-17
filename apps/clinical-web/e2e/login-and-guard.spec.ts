/**
 * CLN-01 acceptance in Chromium: unauthenticated redirect, demo sign-in, deep link with
 * `?redirect=`, reload keeps the session, coordinator permission-denied on the decision route,
 * EN → RW labels, sign out, keyboard skip link.
 */
import { expect, test } from "@playwright/test";

import { signIn } from "./helpers.ts";

test("no session: /clinical redirects to the demo sign-in", async ({ page }) => {
  await page.goto("/clinical");
  await expect(page).toHaveURL(/\/clinical\/login$/);
  await expect(page.getByRole("heading", { level: 1, name: "Demo access" })).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await expect(page.getByRole("note")).toContainText("not authentication");
  await expect(page.getByRole("button", { name: "Ikinyarwanda" })).toBeVisible();
});

test("deep link → login?redirect= → coordinator lands on Patients; denied decision; RW; sign out", async ({
  page,
}) => {
  await page.goto("/clinical/patients");
  await expect(page).toHaveURL(/\/clinical\/login\?redirect=%2Fclinical%2Fpatients$/);

  // Facility select only lists the coordinator's permitted facilities.
  await page.getByRole("button", { name: /Vexqa Zelqiqua/ }).click();
  const facility = page.getByRole("combobox", { name: /Active facility/ });
  await expect(facility.locator("option:not([value=''])")).toHaveText([
    "Demo Health Centre Alpha-1",
    "Demo Health Centre Alpha-2",
  ]);
  await signIn(page, "Vexqa Zelqiqua", "Demo Health Centre Alpha-1");
  await expect(page).toHaveURL(/\/clinical\/patients$/);
  await expect(page.getByRole("heading", { level: 1, name: "Patients" })).toBeVisible();

  // Reload keeps the session.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Patients" })).toBeVisible();
  await expect(page.getByTestId("role-chip")).toHaveText("Facility coordinator");

  await page.goto("/clinical/reviews/any/decision");
  await expect(page).toHaveURL(/\/clinical\/reviews\/any\/decision$/);
  await expect(page.getByTestId("permission-denied")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Not available for this demo role" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ikinyarwanda" }).click();
  await expect(page.getByRole("navigation", { name: /./ }).first()).toContainText(
    "Urutonde rwo gusuzuma",
  );
  await page.getByRole("button", { name: "English" }).click();

  await page.getByRole("button", { name: /Switch demo persona/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/clinical\/login$/);
  await page.goto("/clinical/queue");
  await expect(page).toHaveURL(/\/clinical\/login\?redirect=%2Fclinical%2Fqueue$/);
});

test("keyboard: skip link first, visible focus, Enter selects a persona", async ({ page }) => {
  await page.goto("/clinical/login");
  // Focus starts on the first persona card; Shift+Tab reaches the skip link.
  await expect(page.getByRole("button", { name: /Zorvel Quorandi/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Zorvel Quorandi/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Enter the clinical portal" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("app-shell")).toBeVisible();

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});
