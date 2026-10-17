/**
 * CLN-06 in Chromium (manual script of the phase): clinician Alpha-1 → queue → expand the WF-01 row
 * → Open review → evidence + "How to read this" + ruleset dialog → Start review → pill IN REVIEW →
 * back to the queue → the row shows "In review · you". Then Settings › Conflict on next write →
 * open WF-03 → Start review → conflict panel (nothing overwritten) → reload. No axe violations on
 * the review detail.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers.ts";

/** SEED_ANCHORS (deterministic seed ids, FND-05). */
const WF01_REVIEW = "128f9395-8caf-55e9-9281-75958ca32593";
const WF03_REVIEW = "a77545b0-17cf-5766-a783-67b017db8e88";

test("open from queue → start review → status in queue; conflict on WF-03", async ({ page }) => {
  await page.goto("/clinical/login?redirect=%2Fclinical%2Fqueue");
  await signIn(page, "Zorvel Quorandi", "Demo Health Centre Alpha-1");
  await expect(page.getByTestId("queue-results")).toHaveAttribute("aria-busy", "false");

  const row = page.locator(`[data-testid=queue-row][data-review-id="${WF01_REVIEW}"]`);
  await row.getByRole("button", { expanded: false }).first().click();
  await row.getByRole("button", { name: "Open review" }).click();
  await expect(page).toHaveURL(new RegExp(`/clinical/reviews/${WF01_REVIEW}$`));

  await expect(page.getByRole("heading", { level: 1, name: "Review detail" })).toBeVisible();
  const evidence = page.getByTestId("evidence-panel");
  await expect(evidence.locator("[data-testid=evidence-row][data-status=TRIGGERED]")).toHaveCount(
    3,
  );
  await expect(evidence).toContainText("162 mmHg");
  await expect(evidence).toContainText("Demo placeholder value");
  await expect(page.getByTestId("completeness-meter")).toContainText(
    "5 of 5 required inputs present",
  );
  await expect(page.getByTestId("how-to-read")).toContainText("How to read this");
  await expect(page.getByTestId("review-status")).toHaveText("Pending");

  await page.getByTestId("ruleset-chip").click();
  const rules = page.getByRole("dialog", { name: "Demo ruleset demo-ruleset-2026.10-v1" });
  await expect(rules).toContainText("DEMO_RULE_NOT_CLINICALLY_VALIDATED");
  await rules.getByRole("button", { name: "Close" }).last().click();
  await expect(rules).toBeHidden();

  const axe = await new AxeBuilder({ page }).include("[data-testid=app-shell]").analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);

  await page.getByTestId("start-review").click();
  await expect(page.getByTestId("review-status")).toHaveText("In review");
  await expect(page.getByTestId("record-decision")).toBeVisible();

  await page.getByRole("link", { name: "Review queue" }).first().click();
  await expect(page).toHaveURL(/\/clinical\/queue/);
  await page.getByRole("tab", { name: /^Assigned to me/ }).click();
  await expect(page.getByTestId("queue-results")).toHaveAttribute("aria-busy", "false");
  await expect(
    page.locator(`[data-testid=queue-row][data-review-id="${WF01_REVIEW}"]`),
  ).toContainText("In review · you");

  // Settings › Conflict on next write (in-app navigation) → WF-03 start → conflict panel.
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await page.getByRole("link", { name: "Settings", exact: true }).first().click();
  await page.getByRole("switch", { name: "Conflict on next write" }).click();
  await expect(page.getByRole("switch", { name: "Conflict on next write" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await nav.getByRole("link", { name: /Review queue/ }).click();
  await expect(page.getByTestId("queue-results")).toHaveAttribute("aria-busy", "false");
  const wf03 = page.locator(`[data-testid=queue-row][data-review-id="${WF03_REVIEW}"]`);
  await wf03.getByRole("button", { expanded: false }).first().click();
  await wf03.getByRole("button", { name: "Open review" }).click();
  await expect(page).toHaveURL(new RegExp(`/clinical/reviews/${WF03_REVIEW}$`));
  await page.getByTestId("start-review").click();
  const panel = page.getByTestId("conflict-panel");
  await expect(panel).toContainText("Another clinician changed this review");
  await expect(panel).toContainText("Your version");
  await expect(page.getByTestId("review-status")).toHaveText("Pending");
  await panel.getByRole("button", { name: "Keep the latest version" }).click();
  await expect(panel).toBeHidden();
  await page.getByTestId("start-review").click();
  await expect(page.getByTestId("review-status")).toHaveText("In review");
});

test("coordinator: evidence visible, no Start / Record decision", async ({ page }) => {
  await page.goto(
    `/clinical/login?redirect=${encodeURIComponent(`/clinical/reviews/${WF01_REVIEW}`)}`,
  );
  await signIn(page, "Vexqa Zelqiqua", "Demo Health Centre Alpha-1");
  await expect(page.getByTestId("evidence-panel")).toBeVisible();
  await expect(page.getByTestId("read-only-coordinator")).toHaveText(
    "Decisions require a clinician or authorised reviewer",
  );
  await expect(page.getByTestId("start-review")).toHaveCount(0);
  await expect(page.getByTestId("record-decision")).toHaveCount(0);
});

/** Reads the persisted FND-07 fault config (IndexedDB meta `demo.faults`) of this browser context. */
function persistedFaults(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open("laif-clinical");
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction("meta", "readonly").objectStore("meta").get("demo.faults");
          get.onerror = () => reject(new Error(String(get.error)));
          get.onsuccess = () => {
            resolve(JSON.stringify(get.result ?? null));
            db.close();
          };
        };
      }),
  );
}

test("conflict fault persists across a full reload and still conflicts", async ({ page }) => {
  await page.goto("/clinical/login?redirect=%2Fclinical%2Fsettings");
  await signIn(page, "Zorvel Quorandi", "Demo Health Centre Alpha-1");
  const toggle = page.getByRole("switch", { name: "Conflict on next write" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  // The switch is optimistic; wait until the IndexedDB write committed before reloading.
  await expect.poll(() => persistedFaults(page)).toContain(WF03_REVIEW);

  await page.reload();
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Conflict on next write" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await page.goto(`/clinical/reviews/${WF03_REVIEW}`);
  await page.getByTestId("start-review").click();
  await expect(page.getByTestId("conflict-panel")).toContainText(
    "Another clinician changed this review",
  );
  await expect(page.getByTestId("review-status")).toHaveText("Pending");
});
