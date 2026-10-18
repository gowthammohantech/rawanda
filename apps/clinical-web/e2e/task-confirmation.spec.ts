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
  await expect(awaitingTab).toHaveAttribute("aria-selected", "true");
  // Scope rows to THIS tab's panel: the tab switch is a router navigation rendered in a React
  // transition, so for a frame the previous tab's (Due soon) table is still mounted. Counting
  // `task-table` rows straight after the click raced that frame (badge 1 vs 4 stale rows).
  const panel = page.getByRole("tabpanel", { name: /^Awaiting confirmation/ });
  // Data rows only (the empty state is rendered as a full-width row without a row header).
  const rows = panel
    .getByTestId("task-table")
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader") });
  await expect(rows.first()).toBeVisible();
  const count = Number((await awaitingTab.locator("span").innerText()).trim());
  expect(count).toBeGreaterThan(0);
  await expect(rows).toHaveCount(count);

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
  await expect(awaitingTab.locator("span")).toHaveText(String(count - 1));
  await expect(rows).toHaveCount(count - 1);
  if (count - 1 === 0) await expect(panel.getByTestId("tasks-empty")).toBeVisible();
});
