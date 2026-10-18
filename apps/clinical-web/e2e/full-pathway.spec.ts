/**
 * CLN-11 FRD Scenario 1, end to end from a clean `Reset demo` (task 9): clinician Alpha-1 signs
 * in → review queue → opens WF-01 → evidence with the ruleset version + DEMO_RULE label → Start
 * review → Refer → referral created → demo role switch to the facility coordinator → Referrals:
 * accept → schedule → complete with evidence → Care-team tasks: confirm the worker-reported
 * follow-up (WF-01 step 7; clinician) → Audit: the correlation trail of the decision is complete.
 * Then privacy (task 6): no patient display name in any audit `changeSummary`; and a warn-only
 * performance budget (task 7) for the queue and the patient search.
 */
import { expect, test } from "@playwright/test";

import {
  ALPHA_1,
  PERSONA,
  SEED,
  readStore,
  resetDemo,
  signIn,
  switchPersona,
  waitForRoute,
  type StoredAudit,
} from "./helpers.ts";

test("Scenario 1: sign in → queue → evidence → refer → coordinator closes the loop → audit trail", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await resetDemo(page);
  await signIn(page, PERSONA.clinicianA1, ALPHA_1);
  await expect(page).toHaveURL(/\/clinical\/queue$/);
  await waitForRoute(page, "queue");

  // Queue → WF-01 → review detail: evidence, ruleset version, DEMO_RULE label.
  const row = page.locator(`[data-testid=queue-row][data-review-id="${SEED.WF01_REVIEW}"]`);
  await row.getByRole("button", { expanded: false }).first().click();
  await row.getByRole("button", { name: "Open review" }).click();
  await expect(page).toHaveURL(new RegExp(`/clinical/reviews/${SEED.WF01_REVIEW}$`));
  await expect(page.locator("main")).toContainText("DEMO_RULE_NOT_CLINICALLY_VALIDATED");
  await expect(page.getByTestId("ruleset-chip")).toContainText("Demo ruleset");
  await expect(page.getByTestId("evidence-row").first()).toBeVisible();

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
  const success = page.getByTestId("decision-success");
  await expect(success.getByTestId("success-referral")).toHaveAttribute("data-status", "created");

  // Demo role switch → facility coordinator; referral loop with evidence.
  await switchPersona(page, PERSONA.coordinator);
  await expect(page.getByTestId("role-chip")).toHaveText("Facility coordinator");
  await page.goto("/clinical/referrals");
  await waitForRoute(page, "referrals");
  const openTab = page.getByRole("tab", { name: /^Open/ });
  await expect(openTab).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel", { name: /^Open/ });
  await panel
    .getByRole("button", { name: new RegExp(`^Open referral for ${SEED.WF01_PATIENT.name}`) })
    .first()
    .click();
  const drawer = page.getByTestId("referral-drawer");
  const stepper = drawer.getByTestId("referral-stepper");
  await expect(stepper).toHaveAttribute("data-status", "created");
  await drawer.getByTestId("referral-action-accept").click();
  await page
    .getByRole("dialog", { name: "Accept referral" })
    .getByRole("button", { name: "Accept" })
    .click();
  await expect(stepper).toHaveAttribute("data-status", "accepted");
  await drawer.getByTestId("referral-action-schedule").click();
  const schedule = page.getByRole("dialog", { name: "Schedule appointment" });
  await schedule.getByLabel(/^Appointment date and time/).fill("2026-10-20T09:00");
  await schedule.getByRole("button", { name: "Schedule" }).click();
  await expect(stepper).toHaveAttribute("data-status", "scheduled");
  await drawer.getByTestId("referral-action-complete").click();
  const complete = page.getByRole("dialog", { name: "Complete referral with evidence" });
  await complete.getByLabel(/^Completed at/).fill("2026-10-14T07:30");
  await complete.getByLabel(/^Outcome/).selectOption("attended_seen");
  await complete.getByLabel(/^Evidence type/).selectOption("facility_attendance_record");
  await complete.getByLabel(/^Evidence reference/).fill("REG-2026-0142");
  await complete.getByRole("button", { name: "Review and complete" }).click();
  await page
    .getByRole("dialog", { name: "Complete this referral?" })
    .getByRole("button", { name: "Confirm completion" })
    .click();
  await expect(stepper).toHaveAttribute("data-status", "completed");
  await expect(drawer.getByTestId("referral-evidence")).toContainText("REG-2026-0142");
  await page.keyboard.press("Escape");

  // Care-team tasks: the clinician confirms the worker-reported completion (WF-01 step 7).
  await switchPersona(page, PERSONA.clinicianA1);
  await page.goto(`/clinical/tasks?tab=awaitingConfirmation&id=${SEED.WF01_FU}`);
  const task = page.getByTestId("task-drawer");
  await expect(task.getByTestId("task-awaiting")).toBeVisible();
  await task.getByTestId("task-action-confirm").click();
  await page
    .getByRole("dialog", { name: "Review reported completion" })
    .getByRole("button", { name: "Confirm completion" })
    .click();
  await expect(task.getByTestId("task-confirmation")).toHaveAttribute("data-status", "confirmed");
  await page.keyboard.press("Escape");

  // Audit: the decision's correlation trail is complete and in order.
  await page.goto("/clinical/audit?chip=decisions");
  await waitForRoute(page, "audit");
  const first = page.getByTestId("audit-table").getByRole("row").nth(1);
  await expect(first.locator("[data-action]")).toHaveAttribute("data-action", "review.decided");
  await first.getByRole("button", { name: /Open audit event review\.decided/ }).click();
  const auditDrawer = page.getByTestId("audit-event-drawer");
  await auditDrawer.getByTestId("audit-view-trail").click();
  const trail = auditDrawer.getByTestId("correlation-trail");
  await expect(trail).toBeVisible();
  const actions = await trail
    .locator("[data-action]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-action")));
  const at = (a: string) => actions.indexOf(a);
  expect(at("review.started")).toBeGreaterThanOrEqual(0);
  expect(at("review.started")).toBeLessThan(at("review.decided"));
  expect(at("review.decided")).toBeLessThan(at("referral.created"));
  await page.keyboard.press("Escape");

  // Each action audited exactly once (production build, StrictMode-safe): one decision event
  // and one referral.created for this correlation.
  const audit = await readStore<StoredAudit>(page, "auditEvents");
  const decided = audit.filter((e) => e.action === "review.decided");
  const correlation = decided.at(-1)?.correlationId ?? null;
  expect(correlation).not.toBeNull();
  const trailEvents = audit.filter((e) => e.correlationId === correlation);
  expect(trailEvents.filter((e) => e.action === "review.decided")).toHaveLength(1);
  expect(trailEvents.filter((e) => e.action === "referral.created")).toHaveLength(1);

  // Privacy (task 6): no patient display name in any audit change summary.
  const patients = await readStore<{ displayName: string }>(page, "patients");
  const names = patients.map((p) => p.displayName).filter((n) => n.length > 0);
  expect(names.length).toBeGreaterThan(5);
  const summaries = audit.map((e) => JSON.stringify(e.changeSummary ?? {}));
  const leaks = names.filter((name) => summaries.some((s) => s.includes(name)));
  expect(leaks).toEqual([]);
});

test("performance sanity: queue and patient search render within 1 s (warn-only)", async ({
  page,
}) => {
  await resetDemo(page);
  await signIn(page, PERSONA.clinicianA1, ALPHA_1);
  const budgets: { screen: string; ms: number }[] = [];
  for (const [screen, path, ready] of [
    ["queue", "/clinical/queue", "queue-results"],
    ["patients", "/clinical/patients?q=DEMO", "patient-results"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByTestId(ready)).toBeVisible();
    const ms = await page.evaluate(() => performance.now());
    budgets.push({ screen, ms: Math.round(ms) });
  }
  for (const { screen, ms } of budgets) {
    if (ms > 1000) {
      test.info().annotations.push({
        type: "warning",
        description: `${screen} rendered in ${ms} ms (budget 1000 ms, warn-only)`,
      });
      console.warn(`[perf] ${screen}: ${ms} ms > 1000 ms (warn-only)`);
    }
  }
  expect(budgets).toHaveLength(2);
});
