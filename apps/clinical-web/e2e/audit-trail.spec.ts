/**
 * CLN-10 in Chromium: clinician Alpha-1 records the WF-01 decision → Audit → `Decisions` chip →
 * open the `review.decided` event → View trail (review.started → review.decided →
 * referral.created, in order) → switch to the coordinator → Export CSV → confirm → the
 * downloaded file carries the watermark + scope lines, the id columns and no patient names, and a
 * new `export.generated` row is at the top of the log.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { signIn } from "./helpers.ts";

/** SEED_ANCHORS.WF01_FLAGGED_REVIEW (deterministic seed id, FND-05) and its patient's name. */
const WF01_REVIEW = "128f9395-8caf-55e9-9281-75958ca32593";
const WF01_PATIENT = { name: "Xellequ Varqoxe", syntheticId: "DEMO-P-0003" };

test("WF-01 correlation trail + audited, watermarked export", async ({ page }) => {
  await page.goto(
    `/clinical/login?redirect=${encodeURIComponent(`/clinical/reviews/${WF01_REVIEW}`)}`,
  );
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
  await expect(page.getByTestId("decision-success")).toBeVisible();

  // Audit explorer: Decisions chip → newest decision → drawer → trail.
  await page.goto("/clinical/audit");
  await expect(page.getByTestId("audit-notice")).toContainText("does not prove tamper resistance");
  await expect(page.getByTestId("audit-export")).toHaveCount(0);
  await expect(page.getByTestId("audit-export-unavailable")).toHaveText(
    "Export requires coordinator role",
  );
  await page.getByTestId("audit-chip-decisions").click();
  await expect(page).toHaveURL(/chip=decisions/);
  const firstRow = page.getByTestId("audit-table").getByRole("row").nth(1);
  await expect(firstRow.locator("[data-action]")).toHaveAttribute("data-action", "review.decided");
  await firstRow.getByRole("button", { name: /Open audit event review\.decided/ }).click();
  const drawer = page.getByTestId("audit-event-drawer");
  await expect(drawer).toBeVisible();
  await drawer.getByTestId("audit-view-trail").click();
  const trail = drawer.getByTestId("correlation-trail");
  await expect(trail).toBeVisible();
  const actions = await trail
    .locator("[data-action]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-action")));
  const at = (a: string) => actions.indexOf(a);
  expect(at("review.started")).toBeGreaterThanOrEqual(0);
  expect(at("review.started")).toBeLessThan(at("review.decided"));
  expect(at("review.decided")).toBeLessThan(at("referral.created"));
  const axe = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");

  // Coordinator exports the filtered view.
  await page.getByRole("button", { name: /Switch demo persona/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.goto(
    `/clinical/login?redirect=${encodeURIComponent("/clinical/audit?chip=decisions")}`,
  );
  await signIn(page, "Vexqa Zelqiqua", "Demo Health Centre Alpha-1");
  const exportButton = page.getByTestId("audit-export");
  await expect(exportButton).toBeEnabled();
  await exportButton.click();
  const dialog = page.getByRole("dialog", { name: "Export the audit log as CSV?" });
  await expect(dialog.getByTestId("audit-export-summary")).toContainText(
    "Demo Health Centre Alpha-1 (demo)",
  );
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^laif-demo_audit_log_fac-alpha-1_.*\.csv$/);
  const text = await readFile((await download.path()) ?? "", "utf8");
  expect(text).toContain("# DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE");
  expect(text).toContain("# Synthetic demonstration data");
  expect(text).toContain("# Scope: Demo Health Centre Alpha-1 (demo)");
  expect(text).toContain("# Aho bireba:");
  expect(text).toContain(
    "eventId,occurredAtUtc,action,actorId,actorRole,entityType,entityId,patientSyntheticId,facilityId,correlationId",
  );
  expect(text).toContain("review.decided");
  expect(text).not.toContain("Readings above the demo rule twice");
  expect(text).not.toContain(WF01_PATIENT.name);
  expect(text).toContain(WF01_PATIENT.syntheticId);
  await expect(page.getByText("CSV exported · event recorded")).toBeVisible();

  // The export itself is now in the log (the demo clock restarts on every page load, so the
  // row is located by family rather than by position).
  await page.goto("/clinical/audit?actionFamily=audit");
  await expect(
    page
      .getByTestId("audit-table")
      .getByRole("row")
      .filter({ has: page.locator('[data-action="export.generated"]') })
      .filter({ hasText: "Vexqa Zelqiqua" }),
  ).toHaveCount(1);
});
