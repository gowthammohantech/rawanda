/**
 * CLN-03 / WF-04 in Chromium: clinician Alpha-1 → Ctrl+K search → open a patient (provenance +
 * KPI strip) → the Beta-1 patient's name returns 0 rows → its direct URL is denied without any
 * patient data → the `access.denied` event is listed under the audit explorer's `Denied access`
 * chip (CLN-10) → RW labels.
 */
import { expect, test } from "@playwright/test";

import { signIn } from "./helpers.ts";

/** SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT (deterministic seed ids, FND-05). */
const WF04 = {
  id: "6ff7ed2e-0175-5c3f-afe9-eb2e0169bb7d",
  name: "Quavox Zuxoumbra",
  syntheticId: "DEMO-P-0033",
};

test("WF-04: search excludes the Beta-1 patient and its direct URL is denied", async ({ page }) => {
  await page.goto("/clinical/login?redirect=%2Fclinical%2Fqueue");
  await signIn(page, "Zorvel Quorandi", "Demo Health Centre Alpha-1");

  // ⌘K / Ctrl+K focuses the top-bar search; Enter opens the patient search.
  await page.keyboard.press("Control+k");
  const topbar = page.getByTestId("topbar-search");
  await expect(topbar).toBeFocused();
  await topbar.fill("DEMO");
  await topbar.press("Enter");
  await expect(page).toHaveURL(/\/clinical\/patients\?q=DEMO$/);
  await expect(page.getByRole("heading", { level: 1, name: "Patients" })).toBeVisible();
  const rows = page.getByTestId("patient-row-link");
  await expect(rows.first()).toBeVisible();

  // Open a patient: header, provenance and KPI strip.
  await rows.first().click();
  await expect(page).toHaveURL(/\/clinical\/patients\/[^/]+$/);
  await expect(page.getByTestId("patient-header")).toBeVisible();
  await expect(page.getByTestId("identity-provenance")).toContainText("Facility-scoped demo ID");
  await expect(page.getByTestId("patient-kpis")).toContainText("Open referrals");

  // The Beta-1 patient's name returns nothing in Alpha-1.
  await page.goto(`/clinical/patients?q=${encodeURIComponent(WF04.name)}`);
  await expect(page.getByText(`No synthetic patients match '${WF04.name}'`)).toBeVisible();
  await expect(rows).toHaveCount(0);

  // Direct URL → permission denied, no patient data in the page.
  await page.goto(`/clinical/patients/${WF04.id}`);
  await expect(page.getByTestId("permission-denied")).toBeVisible();
  const body = (await page.locator("body").textContent()) ?? "";
  expect(body).not.toContain(WF04.name);
  expect(body).not.toContain(WF04.syntheticId);

  // CLN-10: the denied attempt is in the audit log under the Denied access chip.
  await page.goto("/clinical/audit");
  await page.getByTestId("audit-chip-deniedAccess").click();
  await expect(page).toHaveURL(/chip=deniedAccess/);
  const denied = page
    .getByTestId("audit-table")
    .getByRole("row")
    .filter({ has: page.locator('[data-action="access.denied"]') })
    .filter({ hasText: WF04.id });
  await expect(denied.first()).toBeVisible();
  await page.goBack();
  await page.goBack();
  await expect(page.getByTestId("permission-denied")).toBeVisible();

  // Labels translate to Kinyarwanda.
  await page.getByRole("button", { name: "Ikinyarwanda" }).click();
  await expect(page.getByRole("link", { name: "Subira ku ishakisha ry'abarwayi" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
});

test("duplicate-pair patient (Beta-1) shows the warning; the identity check is not connected", async ({
  page,
}) => {
  await page.goto("/clinical/login?redirect=%2Fclinical%2Fpatients%3Fq%3DQuavox%2520Zelqox");
  await signIn(page, "Tezrix Vorxoxe");
  const rows = page.getByTestId("patient-row-link");
  await expect(rows).toHaveCount(2);
  await rows.first().click();
  const warning = page.getByTestId("duplicate-warning");
  await expect(warning).toContainText("Records are never merged automatically.");
  await page.getByRole("button", { name: "Check national ID (not connected in demo)" }).click();
  await expect(page.getByTestId("external-identity-result")).toContainText(
    "National identity service is not connected in this demo.",
  );
});
