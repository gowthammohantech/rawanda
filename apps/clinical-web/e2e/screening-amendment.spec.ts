/**
 * CLN-04 / T-06 in Chromium (manual script of the phase). Both screening anchors live in
 * Alpha-2, so the amending clinician is the authorised nurse reviewer Alpha-2 (FND-05; clinician
 * Alpha-1 cannot see Alpha-2 patients): MISSING_UNIT_SCREENING → UNIT MISSING → AMENDED_SCREENING
 * → history (1) → Amend → empty reason error → reason → save → history shows 2 entries with
 * the original retained → Referrals & tasks timeline. Then the coordinator sees no amend action.
 */
import { expect, test } from "@playwright/test";

import { signIn } from "./helpers.ts";

/** SEED_ANCHORS (deterministic seed ids, FND-05). */
const MISSING_UNIT = { id: "0dada724-39b4-5ff2-8d9f-a12439a81864" };
const AMENDED = { id: "cb5850fa-7735-5e17-8b4b-6efa772ad6b5" };

test("amend a screening and verify the correction history (T-06)", async ({ page }) => {
  await page.goto(
    `/clinical/login?redirect=${encodeURIComponent(`/clinical/patients/${MISSING_UNIT.id}`)}`,
  );
  await signIn(page, "Quilra Xabezo");
  await expect(page.getByTestId("patient-header")).toBeVisible();

  await page.getByRole("tab", { name: "Screenings" }).click();
  await expect(page.getByTestId("reading-unit-missing").first()).toBeVisible();
  await expect(
    page.getByText("Value recorded without unit — not evaluated by demo rules").first(),
  ).toBeVisible();

  await page.goto(`/clinical/patients/${AMENDED.id}`);
  await page.getByRole("tab", { name: "Screenings" }).click();
  const card = page.getByTestId("screening-card").first();
  await expect(card).toContainText("126/82 mmHg");
  await card.getByRole("button", { name: "Show correction history (1)" }).click();
  await expect(card.getByTestId("correction-original")).toHaveText("128 mmHg");

  await card.getByRole("button", { name: /^Amend screening measured/ }).click();
  const dialog = page.getByRole("dialog", { name: "Amend screening" });
  await dialog.getByRole("combobox", { name: /Field to correct/ }).selectOption("systolic");
  await dialog.getByRole("textbox", { name: /New value/ }).fill("124");
  await dialog.getByRole("button", { name: "Save amendment" }).click();
  await expect(dialog.getByText("This field is required.")).toBeVisible();

  await dialog
    .getByRole("textbox", { name: /Reason for correction/ })
    .fill("Re-checked the cuff reading with the patient.");
  await dialog.getByRole("button", { name: "Save amendment" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Amendment saved")).toBeVisible();

  const entries = card.getByTestId("correction-entry");
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(1)).toHaveAttribute("data-highlighted", "true");
  await expect(card.getByTestId("correction-original")).toHaveText(["128 mmHg", "126 mmHg"]);
  await expect(card).toContainText("124/82 mmHg");
  await expect(card).toContainText("Re-checked the cuff reading with the patient.");

  await page.getByRole("tab", { name: "Referrals & tasks" }).click();
  await expect(
    page
      .getByTestId("followup-timeline")
      .or(
        page.getByText("No referrals, follow-ups or review decisions for this synthetic patient"),
      ),
  ).toBeVisible();
});

test("the facility coordinator cannot amend", async ({ page }) => {
  await page.goto(
    `/clinical/login?redirect=${encodeURIComponent(`/clinical/patients/${AMENDED.id}`)}`,
  );
  await signIn(page, "Vexqa Zelqiqua", "Demo Health Centre Alpha-2");
  await page.getByRole("tab", { name: "Screenings" }).click();
  await expect(page.getByText("Amendments require clinician privileges").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Amend screening measured/ })).toHaveCount(0);
});
