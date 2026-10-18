/**
 * CTZ-09 FRD journeys on the Expo web export (headless counterpart of the Maestro flows in
 * `.maestro/`): Scenario 1, Scenario 2, the demo-script minute 12–13 and the representative
 * scope check. Persona names in the phase prose ("Aline", "Marie", "Jean-Paul") are
 * placeholders for the synthetic CTZ-P5 / CTZ-P1 / CTZ-P4 personas.
 */
import { expect, test } from "@playwright/test";

import { active, BANNER_EN, choosePersona, openDemoTools, openTab, tid } from "./helpers.ts";

const P1 = "persona-citizen-1";
const P4 = "persona-citizen-rep";
const P5 = "persona-citizen-pending";
/** CTZ-P1's result whose review produced the approved appointment (next step CI2). */
const P1_RESULT = "0e18b111-ba16-5968-8e25-b711ba20cdf6";
const P1_STEP = "3840d669-bf47-5b52-b832-d069bf3b53c4";
const P1_NEW_REMINDER = "843eeacc-f2e2-5b91-8431-0cccf2d697fb";
const P4_RESULT = "4497cc75-4458-5f0c-8489-ca75444c0e4a";

test.beforeEach(({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
});

test("Scenario 1: enrol → result → next step → reminder → care-team confirmation → DONE", async ({
  page,
}) => {
  // Reset demo from the welcome footer.
  await page.goto("/welcome");
  await tid(page, "welcome-demo-tools").click();
  await tid(page, "demo-reset").click();
  await page.getByRole("button", { name: "Reset demo" }).last().click();
  await expect(page.getByText("Demo data was reset to the baseline.")).toBeVisible();

  // Aline (CTZ-P5): simulated verification + consent.
  await choosePersona(page, P5);
  await expect(tid(page, "verify-screen")).toBeVisible();
  await tid(page, "code-input-digit-1").click();
  await page.keyboard.type("246810");
  await tid(page, "verify-submit").click();
  await expect(tid(page, "consent-screen")).toBeVisible();
  await tid(page, "consent-read").click();
  await tid(page, "consent-give").click();
  await expect(tid(page, "health-screen")).toBeVisible();

  // Seeded switch → Marie (CTZ-P1).
  await tid(page, "wallet-menu").click();
  await tid(page, "switch-persona").click();
  await tid(page, `persona-card-${P1}`).click();
  await expect(tid(page, "results-list")).toBeVisible();

  await tid(page, `result-card-${P1_RESULT}`).click();
  await expect(tid(page, "review-provenance")).toBeVisible();
  await tid(page, "result-next-steps").click();
  await tid(page, `next-step-open-${P1_STEP}`).click();
  await tid(page, "acknowledge").click();
  await expect(tid(page, "acknowledged")).toBeVisible();

  await openTab(page, "Reminders");
  await expect(tid(page, "section-scheduled")).toContainText("SCHEDULED");
  await openDemoTools(page);
  await page.getByRole("button", { name: "Advance +7 days" }).click();
  await expect(tid(page, "demo-clock")).toContainText("21 Oct 2026");
  await tid(page, "reminder-inbox-banner").click();
  await tid(page, `reminder-got-it-${P1_NEW_REMINDER}`).click();
  await expect(tid(page, `reminder-got-it-${P1_NEW_REMINDER}`)).toHaveCount(0);

  await openTab(page, "Timeline");
  const step = tid(page, `timeline-item-step:${P1_STEP}`);
  await expect(step).toHaveAttribute("aria-label", /^Status: WAITING\. Appointment/u);
  await expect(tid(page, `timeline-item-reminder:${P1_NEW_REMINDER}`)).toHaveAttribute(
    "aria-label",
    /^NOTE\. Reminder sent \(demo\)/u,
  );

  // Seeded scenario step — DEMO, represents an action in the Clinical Portal.
  await openDemoTools(page);
  await expect(tid(page, "simulate-confirmation-note")).toContainText("DEMO");
  await tid(page, "simulate-confirmation").click();
  await expect(page.getByText(/^Care-team confirmation simulated \(demo\)/u)).toBeVisible();
  await openTab(page, "Timeline");
  await expect(tid(page, `timeline-item-step:${P1_STEP}`)).toHaveAttribute(
    "aria-label",
    /^Status: DONE\. /u,
  );
});

test("Scenario 2: result → Something wrong? → SUBMITTED; resolved request shows original + updated", async ({
  page,
}) => {
  await choosePersona(page, P1);
  await tid(page, `result-card-${P1_RESULT}`).click();
  await tid(page, "result-something-wrong").click();
  await expect(tid(page, "correction-form")).toBeVisible();
  await tid(page, "correction-description").fill("The time of this check looks wrong to me.");
  await tid(page, "correction-understood").click();
  await tid(page, "correction-continue-describe").click();
  await expect(tid(page, "correction-review")).toBeVisible();
  await tid(page, "correction-send").click();
  await expect(tid(page, "correction-success")).toBeVisible();
  await expect(tid(page, "record-unchanged")).toContainText("Your record has not been changed.");
  await tid(page, "correction-done").click();
  await expect(tid(page, "privacy-requests")).toContainText("SUBMITTED");

  await openTab(page, "Timeline");
  await page.getByRole("tab", { name: /^Changes,/u }).click();
  await page.locator(active('[data-testid^="timeline-item-updated:"]')).first().click();
  await expect(tid(page, "change-detail-sheet")).toBeVisible();
  await expect(tid(page, "change-before")).toBeVisible();
  await expect(tid(page, "change-after")).toBeVisible();
  await expect(tid(page, "change-kept")).toBeVisible();
});

test("Demo script minute 12–13: approved next step, then reminders off", async ({ page }) => {
  await choosePersona(page, P1);
  await expect(tid(page, "home-next-step")).toBeVisible();
  await openTab(page, "Next steps");
  await tid(page, `next-step-open-${P1_STEP}`).click();
  await expect(tid(page, "approved-by")).toBeVisible();
  await openTab(page, "Reminders");
  await tid(page, "reminder-toggle").click();
  await page.getByRole("button", { name: "Stop reminders" }).last().click();
  await expect(tid(page, "reminder-toggle")).toHaveAttribute("aria-checked", "false");
  await expect(tid(page, "section-scheduled")).toContainText("Reminders are off");
  await expect(tid(page, "section-scheduled")).not.toContainText("SCHEDULED");
});

test("Representative scope: Jean-Paul sees Grace only; Marie's result deep link is denied", async ({
  page,
}) => {
  await choosePersona(page, P4);
  await expect(tid(page, "representative-banner")).toBeVisible();
  await expect(tid(page, `result-card-${P4_RESULT}`)).toBeVisible();
  await expect(tid(page, `result-card-${P1_RESULT}`)).toHaveCount(0);
  await page.goto(`/health/${P1_RESULT}`);
  await expect(tid(page, "permission-denied")).toBeVisible();
  await expect(tid(page, "result-readings")).toHaveCount(0);
  await expect(page.getByText(BANNER_EN).first()).toBeVisible();
});
