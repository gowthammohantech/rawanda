/**
 * CLN-07 Scenario 1 in Chromium (spec §16 `clinician-review-e2e`): clinician Alpha-1 → queue →
 * WF-01 → Start review → Record decision → Refer (destination + reason + priority + due date) →
 * Save → confirm (summary + attribution) → success → View referral. A double click on Confirm
 * still records one decision. No axe violations on the decision page.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn } from "./helpers.ts";

/** SEED_ANCHORS.WF01_FLAGGED_REVIEW (deterministic seed id, FND-05). */
const WF01_REVIEW = "128f9395-8caf-55e9-9281-75958ca32593";

test("Scenario 1: queue → WF-01 → refer → confirm → referral created", async ({ page }) => {
  await page.goto("/clinical/login?redirect=%2Fclinical%2Fqueue");
  await signIn(page, "Zorvel Quorandi", "Demo Health Centre Alpha-1");
  await expect(page.getByTestId("queue-results")).toHaveAttribute("aria-busy", "false");

  const row = page.locator(`[data-testid=queue-row][data-review-id="${WF01_REVIEW}"]`);
  await row.getByRole("button", { expanded: false }).first().click();
  await row.getByRole("button", { name: "Open review" }).click();
  await page.getByTestId("start-review").click();
  await expect(page.getByTestId("review-status")).toHaveText("In review");
  await page.getByTestId("record-decision").click();
  await expect(page).toHaveURL(new RegExp(`/clinical/reviews/${WF01_REVIEW}/decision$`));

  await expect(page.getByTestId("decision-evidence")).toContainText(
    "DEMO_RULE_NOT_CLINICALLY_VALIDATED",
  );
  await expect(page.getByTestId("decision-save")).toBeDisabled();
  const axe = await new AxeBuilder({ page }).include("[data-testid=app-shell]").analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);

  await page.getByRole("radio", { name: /^Refer/ }).check();
  await page
    .getByLabel(/^Destination facility/)
    .selectOption({ label: "Demo Health Centre Alpha-2 (demo)" });
  await page.getByLabel(/^Referral reason/).fill("Readings above the demo rule twice");
  await page.getByLabel(/^Priority/).selectOption("routine");
  await page.getByLabel(/^Due date and time/).fill("2026-10-21T09:30");
  await page.getByTestId("decision-save").click();

  const dialog = page.getByRole("dialog", { name: "Confirm decision" });
  await expect(dialog).toContainText("A referral (status Created) to Demo Health Centre Alpha-2");
  await expect(dialog).toContainText("21 Oct 2026, 09:30");
  await expect(dialog.getByTestId("decision-attribution")).toContainText(
    "Recorded by Zorvel Quorandi, Clinician, Demo Health Centre Alpha-1",
  );
  await dialog.getByRole("button", { name: "Confirm and save" }).dblclick();

  const success = page.getByTestId("decision-success");
  await expect(success).toHaveAttribute("data-mode", "fresh");
  await expect(success.getByTestId("review-status")).toHaveText("Action recorded");
  await expect(success.getByTestId("success-referral")).toHaveAttribute("data-status", "created");

  // Reload after the save: the recorded decision, not a resubmission.
  await page.reload();
  await expect(page.getByTestId("decision-success")).toHaveAttribute("data-mode", "already");
  await expect(page.getByTestId("decision-form")).toHaveCount(0);

  await page.getByTestId("view-referral").click();
  await expect(page).toHaveURL(/\/clinical\/referrals/);
});
