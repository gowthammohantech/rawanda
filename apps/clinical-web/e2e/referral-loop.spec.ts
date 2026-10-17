/**
 * CLN-08 referral loop in Chromium (spec §16 `referral-loop-e2e`): clinician Alpha-1 decides
 * WF-01 → Refer → View referral (drawer at CREATED) → Accept → Schedule (date) → Complete →
 * empty submit (field errors) → evidence → confirm → stepper complete, evidence visible. Then the
 * Overdue tab: the overdue referral carries the derived label and opens in the drawer. No axe
 * violations in the open drawer.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers.ts";

/** SEED_ANCHORS.WF01_FLAGGED_REVIEW (deterministic seed id, FND-05). */
const WF01_REVIEW = "128f9395-8caf-55e9-9281-75958ca32593";

async function referWf01(page: Page) {
  await page.goto(`/clinical/login?redirect=%2Fclinical%2Freviews%2F${WF01_REVIEW}`);
  await signIn(page, "Zorvel Quorandi", "Demo Health Centre Alpha-1");
  await page.getByTestId("start-review").click();
  await expect(page.getByTestId("review-status")).toHaveText("In review");
  await page.getByTestId("record-decision").click();
  await page.getByRole("radio", { name: /^Refer/ }).check();
  await page
    .getByLabel(/^Destination facility/)
    .selectOption({ label: "Demo Health Centre Alpha-2 (demo)" });
  await page.getByLabel(/^Referral reason/).fill("Readings above the demo rule twice");
  await page.getByLabel(/^Priority/).selectOption("routine");
  await page.getByLabel(/^Due date and time/).fill("2026-10-21T09:30");
  await page.getByTestId("decision-save").click();
  await page
    .getByRole("dialog", { name: "Confirm decision" })
    .getByRole("button", { name: "Confirm and save" })
    .click();
  await expect(page.getByTestId("decision-success")).toHaveAttribute("data-mode", "fresh");
}

test("referral loop: decide → referral → accept → schedule → complete with evidence", async ({
  page,
}) => {
  await referWf01(page);
  await page.getByTestId("view-referral").click();
  await expect(page).toHaveURL(/\/clinical\/referrals\?id=/);

  const drawer = page.getByTestId("referral-drawer");
  const stepper = drawer.getByTestId("referral-stepper");
  await expect(stepper).toHaveAttribute("data-status", "created");
  await expect(stepper.locator('[aria-current="step"]')).toContainText("Created");
  await expect(drawer.getByTestId("referral-linked-review")).toContainText("Refer — decided by");

  const axe = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);

  await drawer.getByTestId("referral-action-accept").click();
  await page
    .getByRole("dialog", { name: "Accept referral" })
    .getByRole("button", { name: "Accept" })
    .click();
  await expect(stepper).toHaveAttribute("data-status", "accepted");

  await drawer.getByTestId("referral-action-schedule").click();
  const schedule = page.getByRole("dialog", { name: "Schedule appointment" });
  await schedule.getByLabel(/^Appointment date and time/).fill("2026-10-20T09:00");
  await schedule.getByRole("button", { name: "Schedule" }).click();
  await expect(stepper).toHaveAttribute("data-status", "scheduled");

  await drawer.getByTestId("referral-action-complete").click();
  const complete = page.getByRole("dialog", { name: "Complete referral with evidence" });
  await expect(complete).toContainText(
    "A reminder or message being sent is not evidence of completion.",
  );
  await complete.getByRole("button", { name: "Review and complete" }).click();
  await expect(complete.getByText("This field is required.").first()).toBeVisible();

  await complete.getByLabel(/^Completed at/).fill("2026-10-14T07:30");
  await complete.getByLabel(/^Outcome/).selectOption("attended_seen");
  await complete.getByLabel(/^Evidence type/).selectOption("facility_attendance_record");
  await complete.getByLabel(/^Evidence reference/).fill("REG-2026-0142");
  await complete.getByRole("button", { name: "Review and complete" }).click();
  await page
    .getByRole("dialog", { name: "Complete this referral?" })
    .getByRole("button", { name: "Confirm completion" })
    .dblclick();

  await expect(stepper).toHaveAttribute("data-status", "completed");
  const evidence = drawer.getByTestId("referral-evidence");
  await expect(evidence).toContainText("REG-2026-0142");
  await expect(evidence).toContainText("Facility attendance record");
  await expect(drawer.getByTestId("referral-history")).toContainText("Referral status changed");
});

test("overdue is derived from the due date and opens in the drawer", async ({ page }) => {
  await page.goto("/clinical/login?redirect=%2Fclinical%2Freferrals%3Ftab%3Doverdue");
  await signIn(page, "Zorvel Quorandi", "Demo Health Centre Alpha-1");
  const overdueTab = page.getByRole("tab", { name: /^Overdue/ });
  await expect(overdueTab).toHaveAttribute("aria-selected", "true");
  const table = page.getByTestId("referral-table");
  await expect(table.getByTestId("referral-overdue").first()).toContainText("(derived)");
  await table
    .getByRole("button", { name: /^Open referral for/ })
    .first()
    .click();
  await expect(page.getByTestId("referral-drawer").getByTestId("referral-overdue")).toBeVisible();
});
