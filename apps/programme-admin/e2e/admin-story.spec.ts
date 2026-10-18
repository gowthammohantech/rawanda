/**
 * ADM-09 consolidated admin story (WF-03, WF-04, FRD Scenario 1, Scenario 2) in a real browser,
 * EN then RW:
 *  1. District Alpha analyst → Overview (first meaningful render < 1 s, PRD §8 target).
 *  2. Funnel → Reviewed drill-down; the dismissed branch is visible (WF-03).
 *  3. Assign a programme follow-up (Scenario 1).
 *  4. Reports → export with a reason; the CSV watermark and District Alpha scope (Scenario 2).
 *  5. Edit the URL to District Beta → 403 (WF-04).
 *  6. Programme lead → Governance audit shows the denied, export and action events.
 *  7. RW: the key assertions again in Kinyarwanda.
 * Plus the threshold acceptance: 5 → 10 hides more cells on the Overview and the drill-down and
 * the CSV says `suppression_threshold=10`; the change is audited with its justification.
 */
import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { readStoreCollection, signInAs } from "./helpers.ts";

const ANALYST = /Quavel Quoriqua/;
const LEAD = /Vaqvox Varqezo/;
type Audit = { action: string; actorId: string; justification: string | null };

async function switchPersona(page: Page, persona: RegExp, scope?: RegExp) {
  await page
    .getByRole("button", { name: /Switch demo persona/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Switch demo persona" }).click();
  await signInAs(page, persona, scope);
}

async function exportCsv(page: Page, granularity = "facility"): Promise<string> {
  await page.getByLabel("Granularity").selectOption(granularity);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("preview-row-count")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: "District meeting" }).check();
  await page.getByRole("checkbox", { name: /aggregate figures only/ }).check();
  await page.getByRole("button", { name: "Next" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-button").click();
  const download = await downloadPromise;
  await expect(page.getByTestId("export-done")).toBeVisible();
  return readFile((await download.path()) ?? "", "utf8");
}

test("admin story: WF-03, WF-04, Scenario 1 and 2, governance audit — EN then RW", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // 1. Analyst → Overview.
  await page.goto("/admin/funnel");
  await signInAs(page, ANALYST);
  await expect(page.getByTestId("funnel-page")).toBeVisible();
  const t0 = await page.evaluate(() => performance.now());
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Overview" })
    .click();
  await expect(page.getByTestId("kpi-strip")).toBeVisible();
  const t1 = await page.evaluate(() => performance.now());
  expect(t1 - t0, "overview first meaningful render (ms)").toBeLessThan(1000);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page).toHaveTitle(/· Programme Dashboard · CareConnect \(Demo\)$/);

  // 2. Funnel → Reviewed; the dismissed branch is counted separately.
  await page.goto("/admin/funnel");
  await expect(page.getByTestId("funnel-dismissed")).toContainText("CLOSED WITH REASON");
  await page.getByTestId("funnel-stage-reviewed").click();
  await expect(page.getByRole("heading", { level: 1, name: "Clinically reviewed" })).toBeVisible();

  // 3. Programme follow-up.
  await page
    .getByTestId("district-row-dist-alpha")
    .getByRole("button", { name: /Demo District Alpha/ })
    .click();
  const row = page.getByTestId("facility-row-fac-alpha-1");
  await row.getByRole("button", { name: /Actions for/ }).click();
  await row.getByRole("button", { name: "Assign programme follow-up" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Category/).selectOption("supervision_visit");
  await dialog.getByLabel(/Title/).fill("Supervision visit after the review backlog");
  await dialog.getByRole("button", { name: "Assign follow-up" }).click();
  await expect(page.getByText("Programme action assigned")).toBeVisible();
  expect(await readStoreCollection(page, "programmeActions")).toHaveLength(1);

  // 4. Reports → aggregate export with a reason.
  await page.goto("/admin/reports?template=programme_summary");
  const csv = await exportCsv(page);
  const lines = csv.slice(1).split("\r\n");
  expect(lines[0]).toBe("# DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE");
  expect(lines).toContain("# scope_districts=dist-alpha");
  expect(lines).toContain("# suppression_threshold=5");
  expect(csv).not.toContain("dist-beta");

  // 5. District Beta → 403.
  await page.goto("/admin/overview?district=dist-beta");
  await expect(
    page.getByRole("heading", { level: 1, name: "Outside your authorised scope" }),
  ).toBeVisible();

  // 6. Programme lead → Governance → Audit log: denied, export and action events.
  await switchPersona(page, LEAD, /All districts in my scope/);
  await page.goto("/admin/governance?tab=audit");
  const explorer = page.getByTestId("audit-explorer");
  for (const [filter, label] of [
    ["access.denied", "Access denied"],
    ["export.", "Export generated"],
    ["admin.programme_action.", "Programme action assigned"],
  ] as const) {
    await explorer.getByRole("combobox", { name: "Action" }).selectOption(filter);
    await explorer.getByRole("button", { name: "Apply filters" }).click();
    await expect(explorer.getByRole("row").filter({ hasText: label }).first()).toBeVisible();
  }

  // 7. RW: the key assertions in Kinyarwanda (language persisted).
  await page.getByRole("banner").getByRole("button", { name: "Ikinyarwanda" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "rw");
  await page.goto("/admin/governance?tab=audit&aaction=access.denied");
  await expect(
    page
      .getByTestId("audit-explorer")
      .getByRole("row")
      .filter({ hasText: "Kwinjira byanze" })
      .first(),
  ).toBeVisible();
  await page.goto("/admin/governance?tab=audit&aaction=admin.programme_action.");
  await expect(
    page
      .getByTestId("audit-explorer")
      .getByRole("row")
      .filter({ hasText: "Igikorwa cya porogaramu cyahawe ushinzwe" })
      .first(),
  ).toBeVisible();
  // The demo sign-in helper speaks English: switch persona in EN, then back to RW.
  await page.getByRole("banner").getByRole("button", { name: "English" }).click();
  await switchPersona(page, ANALYST);
  await page.getByRole("banner").getByRole("button", { name: "Ikinyarwanda" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "rw");
  await page.goto("/admin/funnel");
  await expect(page.getByTestId("funnel-dismissed")).toBeVisible();
  await page.getByTestId("funnel-stage-reviewed").click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Byasuzumwe na muganga" }),
  ).toBeVisible();
  await page.goto("/admin/overview?district=dist-beta");
  await expect(
    page.getByRole("heading", { level: 1, name: "Ntabwo wemerewe kubona aya makuru" }),
  ).toBeVisible();
  await page.goto("/admin/overview");
  await expect(page.getByTestId("kpi-strip")).toBeVisible();
});

test("threshold 5 → 10: more hidden cells on Overview and drill-down; CSV and audit say k = 10", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/admin/overview");
  await signInAs(page, LEAD, /All districts in my scope/);
  await expect(page.getByTestId("kpi-strip")).toBeVisible();
  const hiddenOn = async (path: string, k: number, ready: string) => {
    await page.goto(path);
    await expect(page.getByTestId(ready)).toBeVisible();
    await page.waitForTimeout(300);
    return page.getByText(`<${k}`, { exact: true }).count();
  };
  const overview5 = await hiddenOn("/admin/overview", 5, "kpi-strip");
  const stage5 = await hiddenOn("/admin/funnel/referred", 5, "stage-breakdown");

  await page.goto("/admin/settings");
  const input = page.getByRole("spinbutton", { name: /New threshold/ });
  await input.fill("10");
  await expect(page.getByTestId("threshold-preview")).toContainText("At k = 10");
  await page
    .getByRole("textbox", { name: /Justification/ })
    .fill("Stricter threshold for the district meeting (demo).");
  await page.getByRole("button", { name: "Save threshold" }).click();
  await expect(page.getByText("Threshold updated — dashboards recalculated")).toBeVisible();

  const overview10 = await hiddenOn("/admin/overview", 10, "kpi-strip");
  const stage10 = await hiddenOn("/admin/funnel/referred", 10, "stage-breakdown");
  expect(overview10).toBeGreaterThan(overview5);
  expect(stage10).toBeGreaterThanOrEqual(stage5);
  expect(stage10).toBeGreaterThan(0);

  await page.goto("/admin/reports?template=programme_summary");
  const csv = await exportCsv(page);
  expect(csv.slice(1).split("\r\n")).toContain("# suppression_threshold=10");

  const changed = (await readStoreCollection<Audit>(page, "auditEvents")).filter(
    (e) => e.action === "admin.settings.suppression_threshold_changed",
  );
  expect(changed).toHaveLength(1);
  expect(changed[0]?.justification).toBe("Stricter threshold for the district meeting (demo).");
});
