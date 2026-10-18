/**
 * CTZ-09 DemoBanner route walk on the web export (EN + RW): every wallet route a citizen can
 * open shows the DEMONSTRATION banner and no raw i18n key; no page error is thrown.
 */
import { expect, test } from "@playwright/test";

import { BANNER_EN, choosePersona, tid } from "./helpers.ts";

const BANNER_RW = "IGERAGEZA — AMAKURU Y'ABARWAYI B'IKITEGEREREZO — NTIBIKORESHWA MU BUVUZI";

const ROUTES = [
  "/health",
  "/next-steps",
  "/reminders",
  "/reminders/preferences",
  "/timeline",
  "/more",
  "/more/consent",
  "/more/accessibility",
  "/more/demo-tools",
  "/more/privacy",
  "/more/privacy/notice",
  "/more/privacy/access-history",
  "/more/privacy/corrections",
  "/more/privacy/corrections/new",
  "/more/support",
  "/more/support/help",
  "/more/support/callback",
];

for (const language of ["en", "rw"] as const) {
  test(`every wallet route shows the DemoBanner (${language})`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await choosePersona(page, "persona-citizen-1");
    await expect(tid(page, "results-list")).toBeVisible();
    if (language === "rw") {
      await page.getByRole("radio", { name: "Ikinyarwanda" }).first().click();
    }
    const banner = language === "en" ? BANNER_EN : BANNER_RW;
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.getByText(banner).first(), route).toBeVisible();
      await expect(page.locator("body"), route).not.toContainText(/\bcitizen:[a-zA-Z]+\./u);
    }
    expect(errors).toEqual([]);
  });
}
