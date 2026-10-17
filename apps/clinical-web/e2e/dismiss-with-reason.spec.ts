/**
 * CLN-07 Scenario 2 / WF-03 in Chromium: clinician Alpha-1 → WF-03 → Start review → Record
 * decision → Dismiss with an empty form (errors in EN, then RW after switching language) →
 * rationale → confirm → DISMISSED WITH REASON, nothing else created → the queue's Pending count
 * dropped by one.
 */
import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers.ts";

/** SEED_ANCHORS.WF03_DISMISSABLE_FLAG (deterministic seed id, FND-05). */
const WF03_REVIEW = "a77545b0-17cf-5766-a783-67b017db8e88";

async function pendingBadge(page: Page): Promise<number> {
  await expect(page.getByTestId("queue-results")).toHaveAttribute("aria-busy", "false");
  const tab = page.getByRole("tab", { name: /^Pending\s*\d+$/ });
  await expect(tab).toBeVisible();
  return Number(((await tab.textContent()) ?? "").replace("Pending", "").trim());
}

test("WF-03: dismiss needs a rationale (EN + RW errors); then nothing else is created", async ({
  page,
}) => {
  await page.goto("/clinical/login?redirect=%2Fclinical%2Fqueue");
  await signIn(page, "Zorvel Quorandi", "Demo Health Centre Alpha-1");
  const before = await pendingBadge(page);

  const row = page.locator(`[data-testid=queue-row][data-review-id="${WF03_REVIEW}"]`);
  await row.getByRole("button", { expanded: false }).first().click();
  await row.getByRole("button", { name: "Open review" }).click();
  await page.getByTestId("start-review").click();
  await expect(page.getByTestId("review-status")).toHaveText("In review");
  await page.getByTestId("record-decision").click();

  await page.getByRole("radio", { name: /^Dismiss flag with reason/ }).check();
  await page.getByTestId("decision-save").click();
  const summary = page.getByTestId("decision-error-summary");
  await expect(summary).toBeFocused();
  await expect(page.getByText("This field is required.")).toHaveCount(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Ikinyarwanda" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "rw");
  await expect(page.getByText("Iki gice kigomba kuzuzwa.")).toHaveCount(2);
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.getByLabel(/^Dismiss reason/).selectOption("repeat_reading_acceptable");
  await page.getByLabel(/^Rationale for dismissing/).fill("short");
  await page.getByTestId("decision-save").click();
  await expect(page.getByText("Give a reason of at least 10 characters.")).toBeVisible();
  await page.getByLabel(/^Rationale for dismissing/).fill("Repeat reading within the demo range");
  await page.getByTestId("decision-save").click();

  const dialog = page.getByRole("dialog", { name: "Confirm decision" });
  await expect(dialog).toContainText("Nothing else — no referral or task");
  await dialog.getByRole("button", { name: "Confirm and save" }).click();
  const success = page.getByTestId("decision-success");
  await expect(success.getByTestId("review-status")).toHaveText("Dismissed with reason");
  await expect(success.getByTestId("success-nothing-created")).toBeVisible();
  await expect(success.getByTestId("view-referral")).toHaveCount(0);

  await success.getByTestId("back-to-queue").click();
  await expect(page).toHaveURL(/\/clinical\/queue/);
  await expect.poll(() => pendingBadge(page)).toBe(before - 1);
});
