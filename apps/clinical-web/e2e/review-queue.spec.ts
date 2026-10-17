/**
 * CLN-05 in Chromium: clinician Alpha-1 lands on the queue → KPI strip → Overdue tab (badge ==
 * rows) → filters reconcile → expand a row (readings + demo disclaimer) → sort by due → reload
 * keeps the filters → → opens the review. Coordinator: the facility filter offers Alpha-1 and
 * Alpha-2.
 */
import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers.ts";

const rows = (page: Page) => page.getByTestId("queue-results").getByTestId("queue-row");

async function badge(page: Page, label: string): Promise<number> {
  const tab = page.getByRole("tab", { name: new RegExp(`^${label}\\s*\\d+$`) });
  await expect(tab).toBeVisible();
  const text = (await tab.textContent()) ?? "";
  return Number(text.replace(label, "").trim());
}

async function expectRowsMatchBadge(page: Page, label: string) {
  await expect(page.getByTestId("queue-results")).toHaveAttribute("aria-busy", "false");
  const count = await badge(page, label);
  await expect(rows(page)).toHaveCount(count);
  return count;
}

test("clinician: filter → counts reconcile → open review", async ({ page }) => {
  await page.goto("/clinical/login?redirect=%2Fclinical%2Fqueue");
  await signIn(page, "Zorvel Quorandi", "Demo Health Centre Alpha-1");
  await expect(page).toHaveURL(/\/clinical\/queue$/);
  await expect(page.getByRole("heading", { level: 1, name: "Review queue" })).toBeVisible();
  const kpis = page.getByTestId("queue-kpis");
  await expect(kpis).toContainText("Awaiting review");
  await expect(kpis).toContainText("Urgent (demo protocol)");
  await expect(kpis).toContainText("Reviewed this week");

  const pending = await expectRowsMatchBadge(page, "Pending");
  expect(pending).toBeGreaterThan(0);
  // Sidebar badge == pending count.
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: /Review queue/ }),
  ).toContainText(String(pending));

  await page.getByRole("tab", { name: /^Overdue/ }).click();
  await expect(page).toHaveURL(/tab=overdue/);
  const overdue = await expectRowsMatchBadge(page, "Overdue");
  expect(overdue).toBeGreaterThan(0);
  await expect(rows(page).first()).toContainText("Overdue");

  await page.getByRole("tab", { name: /^All in scope/ }).click();
  await expectRowsMatchBadge(page, "All in scope");
  await page.getByTestId("queue-assignee").selectOption("me");
  await expect(page).toHaveURL(/assignee=me/);
  await expectRowsMatchBadge(page, "All in scope");
  await page.getByTestId("queue-assignee").selectOption("any");
  await page.getByRole("tab", { name: /^Pending/ }).click();
  await expectRowsMatchBadge(page, "Pending");

  // Expand a row: triggering readings + demo disclaimer, no auto-expand before.
  const first = rows(page).first().getByRole("button", { expanded: false });
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(rows(page).first().getByRole("button", { expanded: true })).toBeVisible();
  const detail = page.getByTestId("queue-row-detail");
  await expect(detail).toContainText("Triggering readings");
  await expect(detail).toContainText("Why this needs review");
  await expect(detail).toContainText("DEMO_RULE_NOT_CLINICALLY_VALIDATED");

  // Sort by due date; reload keeps the filters.
  await page.getByTestId("queue-sort").selectOption("dueAt_asc");
  await expect(page).toHaveURL(/sort=dueAt_asc/);
  await page.reload();
  await expect(page.getByTestId("queue-sort")).toHaveValue("dueAt_asc");
  await expectRowsMatchBadge(page, "Pending");

  // → opens the review.
  const reviewId = await rows(page).first().getAttribute("data-review-id");
  await rows(page).first().getByRole("button").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/clinical/reviews/${reviewId ?? ""}$`));
});

test("coordinator: the facility filter offers Alpha-1 and Alpha-2", async ({ page }) => {
  await page.goto("/clinical/login?redirect=%2Fclinical%2Fqueue");
  await signIn(page, "Vexqa Zelqiqua", "Demo Health Centre Alpha-1");
  const facility = page.getByTestId("queue-facility");
  await expect(facility.locator("option")).toHaveText([
    "Demo Health Centre Alpha-1",
    "Demo Health Centre Alpha-2",
  ]);
  await facility.selectOption({ label: "Demo Health Centre Alpha-2" });
  await expect(page).toHaveURL(/facility=fac-alpha-2/);
  await expectRowsMatchBadge(page, "Pending");
});
