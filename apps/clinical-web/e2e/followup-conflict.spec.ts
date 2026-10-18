/**
 * CLN-09 WF-02 clinical half in Chromium: clinician Alpha-1 opens the WF02 follow-up drawer
 * (version 3) → in a SECOND tab Settings › "Simulate worker updating follow-up (WF-02)" saves
 * version 4 as the simulated worker → back in the first tab the drawer still shows the version
 * the clinician opened (a newer one is announced, never swapped in) → Reassign with a reason →
 * conflict dialog "Your change / Latest (by …)" → Re-apply (merged preview) → saved on the
 * latest version. Then the Audit API trail holds `conflict.detected` + `conflict.resolved`.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn } from "./helpers.ts";

/** SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT.followUpId (deterministic seed id, FND-05). */
const WF02_FU = "be6a851a-5d1f-5c8f-be5d-831a5d14fecd";

test("WF-02: stale reassign → conflict dialog → re-apply on latest", async ({ page, context }) => {
  await page.goto(`/clinical/login?redirect=%2Fclinical%2Ftasks%3Fid%3D${WF02_FU}`);
  await signIn(page, "Zorvel Quorandi", "Demo Health Centre Alpha-1");
  const drawer = page.getByTestId("task-drawer");
  await expect(drawer.getByTestId("task-version")).toHaveText("Version 3");
  await expect(drawer.getByTestId("wf02-hint")).toBeVisible();

  // Second tab: the simulated worker saves version 4.
  const settings = await context.newPage();
  await settings.goto("/clinical/settings");
  await expect(settings.getByTestId("snapshot-wf02-version")).toHaveText("3");
  await settings
    .getByRole("button", { name: "Simulate worker updating follow-up (WF-02)" })
    .click();
  await expect(settings.getByTestId("snapshot-wf02-version")).toHaveText("4");
  await settings.close();

  await page.bringToFront();
  await expect(drawer.getByTestId("task-version")).toHaveText("Version 3");
  await drawer.getByTestId("task-action-reassign").click();
  const dialog = page.getByRole("dialog", { name: "Reassign task" });
  await dialog.getByLabel(/^Health worker/).selectOption({ index: 1 });
  await dialog.getByLabel(/^Reason for reassigning/).fill("Closer to the household this week.");
  await dialog.getByRole("button", { name: "Reassign" }).click();

  const conflict = page.getByRole("dialog", { name: "This task changed while you were working" });
  await expect(conflict).toBeVisible();
  await expect(conflict.getByText("Your change")).toBeVisible();
  await expect(conflict.getByTestId("conflict-latest-header")).toContainText(
    "Latest (by Oxavel Oquumbra",
  );
  const axe = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);

  await conflict.getByRole("button", { name: "Re-apply my change on latest" }).click();
  const preview = page.getByRole("dialog", { name: "Re-apply your change on the latest version?" });
  await expect(preview.getByTestId("conflict-preview")).toContainText("Contacted");
  await preview.getByRole("button", { name: "Save on latest version" }).click();
  await expect(page.getByText("Your change was saved on the latest version")).toBeVisible();
  await expect(drawer.getByTestId("task-version")).toHaveText("Version 5");

  // Audit explorer (CLN-10) is not built yet: read the trail through the app's IndexedDB.
  const actions = await page.evaluate(async (id) => {
    const open = indexedDB.open("laif-clinical");
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(new Error("indexedDB open failed"));
    });
    const tx = db.transaction("auditEvents", "readonly");
    const all: { action: string; entityId: string; changeSummary: Record<string, unknown> }[] =
      await new Promise((resolve) => {
        const req = tx.objectStore("auditEvents").getAll();
        req.onsuccess = () => resolve(req.result as never);
      });
    return all
      .filter((e) => e.entityId === id && e.action.startsWith("conflict."))
      .map((e) => {
        const resolution = e.changeSummary["resolution"];
        return `${e.action}:${typeof resolution === "string" ? resolution : ""}`;
      });
  }, WF02_FU);
  expect(actions).toContain("conflict.detected:");
  expect(actions).toContain("conflict.resolved:reapply_on_latest");
});
