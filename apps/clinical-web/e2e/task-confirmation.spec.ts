/**
 * CLN-09 WF-01 step 7 in Chromium: clinician Alpha-1 → Care-team tasks → Awaiting confirmation
 * shows WF01_WORKER_COMPLETED_FU (worker-reported completion) → drawer → Review completion
 * (worker outcome, attempts, evidence type) → Confirm → the task moves to Completed with
 * clinician confirmation "Confirmed" by the clinician. Tab badges equal their rows.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn } from "./helpers.ts";

/** SEED_ANCHORS.WF01_WORKER_COMPLETED_FU.followUpId (deterministic seed id, FND-05). */
const WF01_FU = "0c37e8e7-ceac-5285-8c45-02e7ceb7090f";

test("WF-01 step 7: confirm a worker-reported completion", async ({ page }) => {
  await page.goto("/clinical/login?redirect=%2Fclinical%2Ftasks");
  await signIn(page, "Zorvel Quorandi", "Demo Health Centre Alpha-1");
  await expect(page.getByTestId("tasks-page")).toBeVisible();

  const awaitingTab = page.getByRole("tab", { name: /^Awaiting confirmation/ });
  await awaitingTab.click();
  const table = page.getByTestId("task-table");
  const rows = table.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  await expect(awaitingTab).toContainText(String(count));

  const axe = await new AxeBuilder({ page }).include("[data-testid=tasks-page]").analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);

  await page.goto(`/clinical/tasks?tab=awaitingConfirmation&id=${WF01_FU}`);
  const drawer = page.getByTestId("task-drawer");
  await expect(drawer.getByTestId("task-awaiting")).toBeVisible();
  await drawer.getByTestId("task-action-confirm").click();
  const dialog = page.getByRole("dialog", { name: "Review reported completion" });
  await expect(dialog.getByTestId("worker-outcome")).toContainText("Ixozo Texaelix");
  await dialog.getByRole("button", { name: "Confirm completion" }).click();
  await expect(page.getByText("Completion confirmed")).toBeVisible();
  await expect(drawer.getByTestId("task-confirmation")).toHaveAttribute("data-status", "confirmed");
  await expect(drawer.getByTestId("task-confirmation")).toContainText("Zorvel Quorandi");
  await expect(page.getByTestId("tasks-announcement")).toContainText("Completed");

  await page.keyboard.press("Escape");
  await expect(awaitingTab).toContainText(String(count - 1));
});
