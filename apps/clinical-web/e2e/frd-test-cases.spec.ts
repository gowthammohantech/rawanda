/**
 * CLN-11 task 10: FRD §8 T-01 … T-10, one test each, each from a clean `Reset demo`
 * (`window.__laifDemo`, E2E build). Earlier phase specs cover the same paths in more depth;
 * this file is the FRD traceability suite REL-03 references.
 */
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

import {
  ALPHA_1,
  PERSONA,
  SEED,
  readStore,
  resetDemo,
  setFaults,
  signInTo,
  type StoredAudit,
} from "./helpers.ts";

async function startAndOpenDecision(page: Page, reviewId: string) {
  await signInTo(page, `/clinical/reviews/${reviewId}`, PERSONA.clinicianA1, ALPHA_1);
  await page.getByTestId("start-review").click();
  await expect(page.getByTestId("review-status")).toHaveText("In review");
  await page.getByTestId("record-decision").click();
  await expect(page.getByTestId("decision-form")).toBeVisible();
}

async function fillDismiss(page: Page) {
  await page.getByRole("radio", { name: /^Dismiss flag with reason/ }).check();
  await page.getByLabel(/^Dismiss reason/).selectOption("repeat_reading_acceptable");
  await page.getByLabel(/^Rationale for dismissing/).fill("Repeat reading within the demo range");
}

const decidedEvents = async (page: Page, reviewId: string) =>
  (await readStore<StoredAudit>(page, "auditEvents")).filter(
    (e) =>
      (e.action === "review.decided" || e.action === "review.dismissed") && e.entityId === reviewId,
  );

test.beforeEach(async ({ page }) => {
  await resetDemo(page);
});

test("T-01: a recorded decision is saved and audited", async ({ page }) => {
  await startAndOpenDecision(page, SEED.WF03_REVIEW);
  await fillDismiss(page);
  await page.getByTestId("decision-save").click();
  await page
    .getByRole("dialog", { name: "Confirm decision" })
    .getByRole("button", { name: "Confirm and save" })
    .click();
  const success = page.getByTestId("decision-success");
  await expect(success.getByTestId("review-status")).toHaveText("Dismissed with reason");
  await expect.poll(async () => (await decidedEvents(page, SEED.WF03_REVIEW)).length).toBe(1);
});

test("T-02: an out-of-scope (Beta-1) patient URL is denied without any patient data", async ({
  page,
}) => {
  await signInTo(page, `/clinical/patients/${SEED.WF04.id}`, PERSONA.clinicianA1, ALPHA_1);
  await expect(page.getByTestId("permission-denied")).toBeVisible();
  const body = (await page.locator("body").textContent()) ?? "";
  expect(body).not.toContain(SEED.WF04.name);
  expect(body).not.toContain(SEED.WF04.syntheticId);
  await expect
    .poll(async () =>
      (await readStore<StoredAudit>(page, "auditEvents")).some(
        (e) => e.action === "access.denied" && e.entityId === SEED.WF04.id,
      ),
    )
    .toBe(true);
});

test("T-03: a dismissal without reason / rationale shows field errors and saves nothing", async ({
  page,
}) => {
  await startAndOpenDecision(page, SEED.WF03_REVIEW);
  await page.getByRole("radio", { name: /^Dismiss flag with reason/ }).check();
  await page.getByTestId("decision-save").click();
  await expect(page.getByTestId("decision-error-summary")).toBeFocused();
  await expect(page.getByText("This field is required.")).toHaveCount(2);
  await page.getByLabel(/^Rationale for dismissing/).fill("short");
  await page.getByTestId("decision-save").click();
  await expect(page.getByText("Give a reason of at least 10 characters.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await decidedEvents(page, SEED.WF03_REVIEW)).toHaveLength(0);
});

test("T-04: a double-click on Confirm records exactly one decision", async ({ page }) => {
  await startAndOpenDecision(page, SEED.WF03_REVIEW);
  await fillDismiss(page);
  await page.getByTestId("decision-save").click();
  await page
    .getByRole("dialog", { name: "Confirm decision" })
    .getByRole("button", { name: "Confirm and save" })
    .dblclick();
  await expect(page.getByTestId("decision-success")).toBeVisible();
  await page.waitForTimeout(300);
  expect(await decidedEvents(page, SEED.WF03_REVIEW)).toHaveLength(1);
});

test("T-05: a conflicting write shows the conflict panel and changes nothing", async ({ page }) => {
  await setFaults(page, { conflictOnce: [{ entityType: "review", entityId: SEED.WF03_REVIEW }] });
  await signInTo(page, `/clinical/reviews/${SEED.WF03_REVIEW}`, PERSONA.clinicianA1, ALPHA_1);
  await page.getByTestId("start-review").click();
  await expect(page.getByTestId("conflict-panel")).toContainText(
    "Another clinician changed this review",
  );
  await expect(page.getByTestId("review-status")).toHaveText("Pending");
});

test("T-06: an amendment keeps the original value in the correction history", async ({ page }) => {
  await signInTo(page, `/clinical/patients/${SEED.AMENDED_SCREENING_PATIENT}`, PERSONA.nurseA2);
  await page.getByRole("tab", { name: "Screenings" }).click();
  await expect(page.getByRole("tab", { name: "Screenings" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const card = page.getByRole("tabpanel").getByTestId("screening-card").first();
  await card.getByRole("button", { name: "Show correction history (1)" }).click();
  await expect(card.getByTestId("correction-original")).toHaveText("128 mmHg");
  await card.getByRole("button", { name: /^Amend screening measured/ }).click();
  const dialog = page.getByRole("dialog", { name: "Amend screening" });
  await dialog.getByRole("combobox", { name: /Field to correct/ }).selectOption("systolic");
  await dialog.getByRole("textbox", { name: /New value/ }).fill("124");
  await dialog
    .getByRole("textbox", { name: /Reason for correction/ })
    .fill("Re-checked the cuff reading with the patient.");
  await dialog.getByRole("button", { name: "Save amendment" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card.getByTestId("correction-entry")).toHaveCount(2);
  await expect(card.getByTestId("correction-original")).toHaveText(["128 mmHg", "126 mmHg"]);
  await expect(card).toContainText("124/82 mmHg");
});

test("T-07: the external identity service is shown as unavailable (never faked)", async ({
  page,
}) => {
  await signInTo(page, "/clinical/patients?q=Quavox%20Zelqox", PERSONA.clinicianB1);
  await page.getByTestId("patient-row-link").first().click();
  await page.getByRole("button", { name: "Check national ID (not connected in demo)" }).click();
  await expect(page.getByTestId("external-identity-result")).toContainText(
    "National identity service is not connected in this demo.",
  );
});

test("T-08: the audit export is watermarked and itself audited", async ({ page }) => {
  await signInTo(page, "/clinical/audit", PERSONA.coordinator, ALPHA_1);
  await page.getByTestId("audit-export").click();
  const dialog = page.getByRole("dialog", { name: "Export the audit log as CSV?" });
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  const text = await readFile((await download.path()) ?? "", "utf8");
  expect(text).toContain("# DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE");
  expect(text).not.toContain(SEED.WF01_PATIENT.name);
  await expect
    .poll(
      async () =>
        (await readStore<StoredAudit>(page, "auditEvents")).filter(
          (e) => e.action === "export.generated",
        ).length,
    )
    .toBe(1);
});

test("T-09: a reload mid-decision restores the draft; after saving, a reload is idempotent", async ({
  page,
}) => {
  await startAndOpenDecision(page, SEED.WF03_REVIEW);
  await fillDismiss(page);
  await page.waitForTimeout(600); // draft autosave (debounced)
  await page.reload();
  await expect(page.getByTestId("draft-restore")).toBeVisible();
  await page.getByTestId("draft-restore-yes").click();
  await expect(page.getByLabel(/^Rationale for dismissing/)).toHaveValue(
    "Repeat reading within the demo range",
  );
  await page.getByTestId("decision-save").click();
  await page
    .getByRole("dialog", { name: "Confirm decision" })
    .getByRole("button", { name: "Confirm and save" })
    .click();
  await expect(page.getByTestId("decision-success")).toHaveAttribute("data-mode", "fresh");
  await page.reload();
  await expect(page.getByTestId("decision-success")).toHaveAttribute("data-mode", "already");
  expect(await decidedEvents(page, SEED.WF03_REVIEW)).toHaveLength(1);
});

test("T-10: the rule version and every input of the flag are visible", async ({ page }) => {
  await signInTo(page, `/clinical/reviews/${SEED.WF01_REVIEW}`, PERSONA.clinicianA1, ALPHA_1);
  await expect(page.getByTestId("ruleset-chip")).toContainText("Demo ruleset");
  await expect(page.getByTestId("ruleset-chip")).toContainText("not clinically validated");
  await expect(page.locator("main")).toContainText("DEMO_RULE_NOT_CLINICALLY_VALIDATED");
  const rows = page.getByTestId("evidence-panel").getByTestId("evidence-row");
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(rows.first().getByTestId("evidence-threshold")).toBeVisible();
});

test.afterEach(async ({ page }) => {
  // Leave no fault behind for the next spec in this worker.
  await page.evaluate(() =>
    (window as unknown as { __laifDemo?: { reset: () => Promise<boolean> } }).__laifDemo?.reset(),
  );
});
