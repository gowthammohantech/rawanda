/**
 * ADM-06: District Alpha analyst → Safety & quality → open a missing-unit issue → resolve with a
 * note (a 3-character note is rejected first) → Resolved tab count +1 → reload persists →
 * send another issue to the facility (programme action prefilled) → the action is visible on the
 * Funnel side card. No screening is changed (IndexedDB snapshot before / after).
 */
import { expect, test, type Page } from "@playwright/test";

import { readStoreCollection, signInAs } from "./helpers.ts";

type Issue = { id: string; type: string; status: string; programmeActionId: string | null };
type Action = { id: string; title: string; category: string };

const tabCount = async (page: Page, name: RegExp): Promise<number> =>
  Number(/(\d+)\s*$/.exec((await page.getByRole("tab", { name }).textContent()) ?? "")?.[1]);

test("quality triage: resolve a missing-unit issue, reload, send another to the facility", async ({
  page,
}) => {
  await page.goto("/admin/quality");
  await signInAs(page, /Quavel Quoriqua/);
  await expect(page.getByRole("heading", { level: 1, name: "Safety & quality" })).toBeVisible();
  await expect(page.getByTestId("kpi-strip")).toBeVisible();
  const queue = page.getByTestId("issue-queue");
  await expect(queue.locator('[data-testid^="issue-row-"]').first()).toBeVisible();
  const screeningsBefore = await readStoreCollection(page, "screenings");
  const resolvedBefore = await tabCount(page, /^Resolved/);

  // 1. Open a missing-unit issue.
  await page.getByTestId("type-chips").getByRole("button", { name: "Missing field" }).click();
  const row = queue.locator('[data-testid^="issue-row-"]').first();
  await expect(row).toContainText("MISSING FIELD");
  const rowId = ((await row.getAttribute("data-testid")) ?? "").replace("issue-row-", "");
  await row.getByRole("button").first().click();
  await expect(row.getByTestId("issue-detected")).toContainText("Glucose unit");
  await expect(row.getByTestId("issue-rule")).toContainText("DQ-01-MANDATORY-FIELDS");

  // 2. Resolve: a short note is rejected, a valid one resolves.
  await row.getByRole("button", { name: "Resolve with note…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("abc");
  await dialog.getByRole("button", { name: "Resolve" }).click();
  await expect(dialog.getByTestId("triage-note-error")).toHaveText(
    "Add a note of 10 to 500 characters",
  );
  await dialog.getByRole("textbox").fill("Unit confirmed with the facility register (mmol/L)");
  await dialog.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("Issue resolved")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect.poll(() => tabCount(page, /^Resolved/)).toBe(resolvedBefore + 1);

  // 3. Reload: it persists.
  await page.reload();
  await expect(page.getByTestId("issue-queue")).toBeVisible();
  await expect.poll(() => tabCount(page, /^Resolved/)).toBe(resolvedBefore + 1);
  await page.getByRole("tab", { name: /^Resolved/ }).click();
  await expect(page.getByTestId(`issue-row-${rowId}`)).toBeVisible();
  const stored = await readStoreCollection<Issue>(page, "dataQualityIssues");
  expect(stored.find((i) => i.id === rowId)?.status).toBe("resolved_with_note");

  // 4. Send another (open) issue to the facility.
  await page.getByRole("tab", { name: /^Open/ }).click();
  const other = page.getByTestId("issue-queue").locator('[data-testid^="issue-row-"]').first();
  const otherId = ((await other.getAttribute("data-testid")) ?? "").replace("issue-row-", "");
  await other.getByRole("button").first().click();
  await other.getByRole("button", { name: "Send to facility…" }).click();
  const assign = page.getByRole("dialog");
  await expect(assign.getByTestId("programme-action-banner")).toBeVisible();
  await expect(assign.getByLabel(/Category/)).toHaveValue("data_completeness_check");
  const title = await assign.getByLabel(/Title/).inputValue();
  expect(title).toMatch(/^Review .+ issue (SCR|REV|PAT)-[0-9a-z]{8}$/);
  await assign.getByRole("button", { name: "Assign follow-up" }).click();
  await expect(page.getByText("Issue sent to the facility")).toBeVisible();
  await expect
    .poll(
      async () =>
        (await readStoreCollection<Issue>(page, "dataQualityIssues")).find((i) => i.id === otherId)
          ?.status,
    )
    .toBe("sent_to_facility");
  const actions = await readStoreCollection<Action>(page, "programmeActions");
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ title, category: "data_completeness_check" });

  // 5. The programme action is visible on the Funnel side card.
  await page.getByRole("link", { name: "Pathway funnel" }).first().click();
  await expect(page.getByTestId("programme-actions-card")).toContainText(title);

  // Triage never changed a screening.
  expect(await readStoreCollection(page, "screenings")).toEqual(screeningsBefore);
});

test("auditor: the queue is read-only", async ({ page }) => {
  await page.goto("/admin/quality");
  await signInAs(page, /Zorqa Zelqumbra/);
  await expect(page.getByTestId("queue-readonly")).toBeVisible();
  const row = page.getByTestId("issue-queue").locator('[data-testid^="issue-row-"]').first();
  await row.getByRole("button").first().click();
  await expect(row.getByTestId("issue-readonly")).toBeVisible();
  await expect(row.getByRole("button", { name: "Acknowledge" })).toHaveCount(0);
});
