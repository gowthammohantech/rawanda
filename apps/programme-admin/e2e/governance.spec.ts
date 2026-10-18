/**
 * ADM-08 governance: (1) the programme lead narrows the District Alpha analyst's grant to one
 * facility → switch persona → the removed facility URL gives 403; (2) access simulator "Try it"
 * → the real 403 + one `access.denied`, then "Return to …"; (3) the audit tab shows
 * `admin.access_grant.changed` with before → after.
 */
import { expect, test, type Page } from "@playwright/test";

import { readStoreCollection, signInAs } from "./helpers.ts";

const LEAD = /Vaqvox Varqezo/;
const ANALYST = "Quavel Quoriqua";

type Audit = { action: string; actorId: string; correlationId: string };

async function signInLead(page: Page, path: string) {
  await page.goto(path);
  await signInAs(page, LEAD, /All districts in my scope/);
}

async function narrowAnalystGrant(page: Page) {
  await page.goto("/admin/governance?tab=roles");
  await page.getByRole("button", { name: `Edit the access grant of ${ANALYST}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Selected facilities only" }).check();
  await dialog.getByRole("checkbox", { name: "Demo Health Centre Alpha-2" }).check();
  // Without a justification nothing is saved.
  await dialog.getByRole("button", { name: "Save grant" }).click();
  await expect(dialog.getByText("Give a justification of 10 to 300 characters")).toBeVisible();
  await dialog
    .getByRole("textbox", { name: /Justification/ })
    .fill("Supervision review limited to Alpha-2 (demo).");
  await dialog.getByRole("button", { name: "Save grant" }).click();
  await expect(page.getByText("Access grant saved")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("programme lead narrows the analyst grant → the analyst's removed facility gives 403", async ({
  page,
}) => {
  await signInLead(page, "/admin/governance?tab=roles");
  await narrowAnalystGrant(page);

  await page
    .getByRole("button", { name: /Switch demo persona/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Switch demo persona" }).click();
  await signInAs(page, new RegExp(ANALYST));

  await page.goto("/admin/overview?facility=fac-alpha-1");
  await expect(
    page.getByRole("heading", { level: 1, name: "Outside your authorised scope" }),
  ).toBeVisible();
  await page.goto("/admin/overview?facility=fac-alpha-2");
  await expect(page.getByTestId("overview-page")).toBeVisible();
});

test("simulator: Alpha analyst × District Beta is DENIED; Try it → real 403 and one access.denied", async ({
  page,
}) => {
  await signInLead(page, "/admin/governance?tab=access");
  const sim = page.getByTestId("access-simulator");
  await sim.getByRole("combobox", { name: "Demo persona" }).selectOption("persona-analyst-alpha");
  await sim.getByRole("combobox", { name: "Resource type" }).selectOption("district");
  await sim.getByRole("combobox", { name: "Resource", exact: true }).selectOption("dist-beta");
  await sim.getByRole("button", { name: "Check access" }).click();
  await expect(sim.getByTestId("simulation-reason")).toHaveText("OUT_OF_SCOPE_DISTRICT");

  await sim.getByRole("button", { name: `Try as ${ANALYST}: open District Beta overview` }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Outside your authorised scope" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/overview\?district=dist-beta$/);

  const raw = await page.evaluate(() => window.localStorage.getItem("laif.admin.session") ?? "{}");
  const correlationId = (JSON.parse(raw) as { session?: { correlationId?: string } }).session
    ?.correlationId;
  expect(correlationId).toBeTruthy();
  await expect
    .poll(
      async () =>
        (await readStoreCollection<Audit>(page, "auditEvents")).filter(
          (e) => e.action === "access.denied" && e.correlationId === correlationId,
        ).length,
    )
    .toBe(1);
  await page.waitForTimeout(500);
  expect(
    (await readStoreCollection<Audit>(page, "auditEvents")).filter(
      (e) => e.action === "access.denied" && e.correlationId === correlationId,
    ),
  ).toHaveLength(1);

  await page
    .getByTestId("simulation-return-banner")
    .getByRole("button", { name: /Return to Vaqvox Varqezo/ })
    .click();
  await expect(page.getByTestId("access-simulator")).toBeVisible();
  await expect(page.getByTestId("simulation-return-banner")).toHaveCount(0);
});

test("the audit tab shows admin.access_grant.changed with before → after", async ({ page }) => {
  await signInLead(page, "/admin/governance?tab=roles");
  await narrowAnalystGrant(page);
  await page.getByRole("tab", { name: /^Audit log/ }).click();
  const explorer = page.getByTestId("audit-explorer");
  await explorer.getByRole("combobox", { name: "Action" }).selectOption("admin.access_grant.");
  await explorer.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/aaction=admin\.access_grant\./);
  const row = explorer.getByRole("row").filter({ hasText: "Access grant changed" }).first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId("grant-change-summary")).toContainText("v1 → v2");
  await expect(row.getByTestId("grant-change-summary")).toContainText(
    "Facilities: All facilities in selected districts → Demo Health Centre Alpha-2",
  );
  await expect(row).toContainText("Supervision review limited to Alpha-2 (demo).");
});
