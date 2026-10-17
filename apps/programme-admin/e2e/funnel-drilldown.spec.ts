/**
 * ADM-03 / FRD Scenario 1: District Alpha analyst → Pathway funnel → Reviewed drill-down →
 * district row expanded (facility values sum to the district) → assign a programme follow-up →
 * it appears in the side card → survives a reload (IndexedDB) → demo `conflict` fault + status
 * change shows the ConflictNotice and nothing is overwritten.
 */
import { expect, test, type Locator } from "@playwright/test";

import { readStoreCollection, signInAs } from "./helpers.ts";

type Action = { id: string; status: string; version: number; title: string };

const numberIn = async (row: Locator, column: number): Promise<number> =>
  Number(((await row.locator("td").nth(column).textContent()) ?? "").replace(/[^\d]/g, ""));

test("funnel → reviewed drill-down → assign programme follow-up → reload → conflict", async ({
  page,
}) => {
  await page.goto("/admin/funnel");
  await signInAs(page, /Quavel Quoriqua/);
  await expect(page.getByRole("heading", { level: 1, name: "Pathway funnel" })).toBeVisible();
  await expect(page.getByTestId("funnel-dismissed")).toContainText("CLOSED WITH REASON");

  // 1. Click "Reviewed".
  await page.getByTestId("funnel-stage-reviewed").click();
  await expect(page).toHaveURL(/\/admin\/funnel\/reviewed$/);
  await expect(page.getByRole("heading", { level: 1, name: "Clinically reviewed" })).toBeVisible();

  // 2. Expand the district row; facility values sum to the district value.
  const district = page.getByTestId("district-row-dist-alpha");
  await district.getByRole("button", { name: /Demo District Alpha/ }).click();
  const a1 = page.getByTestId("facility-row-fac-alpha-1");
  const a2 = page.getByTestId("facility-row-fac-alpha-2");
  await expect(a1).toBeVisible();
  expect((await numberIn(a1, 0)) + (await numberIn(a2, 0))).toBe(await numberIn(district, 0));

  // 3. Assign an action from the facility row; it appears in the side card.
  await a1.getByRole("button", { name: /Actions for/ }).click();
  await a1.getByRole("button", { name: "Assign programme follow-up" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("programme-action-banner")).toHaveText(
    "Programme action — not a clinical decision",
  );
  await dialog.getByRole("button", { name: "Assign follow-up" }).click();
  await expect(dialog.getByText("Title must be 5 to 120 characters")).toBeVisible();
  await dialog.getByLabel(/Category/).selectOption("data_completeness_check");
  await dialog.getByLabel(/Title/).fill("Check review completeness at Alpha-1");
  await dialog.getByRole("button", { name: "Assign follow-up" }).click();
  await expect(page.getByText("Programme action assigned")).toBeVisible();
  await expect(dialog).toBeHidden();
  const card = page.getByTestId("programme-actions-card");
  await expect(card).toContainText("Check review completeness at Alpha-1");
  const stored = await readStoreCollection<Action>(page, "programmeActions");
  expect(stored).toHaveLength(1);
  const id = stored[0]?.id ?? "";

  // 4. Reload: it persists.
  await page.reload();
  const item = page.getByTestId(`programme-action-${id}`);
  await expect(item).toContainText("Check review completeness at Alpha-1");
  await expect(item).toContainText("Open");

  // 5. Demo `conflict` fault, then a status change → ConflictNotice; nothing overwritten.
  await item.getByRole("button", { name: "Demo: make the next update conflict" }).click();
  await expect(page.getByText("Demo: the next update of this action will conflict")).toBeVisible();
  await item.getByRole("button", { name: "Start" }).click();
  const notice = item.getByRole("region", { name: "This action was changed by someone else" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("In progress");
  expect((await readStoreCollection<Action>(page, "programmeActions"))[0]).toMatchObject({
    status: "open",
    version: 1,
  });
  await notice.getByRole("button", { name: /Re-apply my change/ }).click();
  await expect(item).toContainText("In progress");
  await expect
    .poll(async () => (await readStoreCollection<Action>(page, "programmeActions"))[0]?.status)
    .toBe("in_progress");
});

test("auditor gets 403 on the drill-down URL", async ({ page }) => {
  await page.goto("/admin/funnel/reviewed");
  await signInAs(page, /Zorqa Zelqumbra/);
  await expect(page.getByTestId("forbidden-page")).toBeVisible();
});
