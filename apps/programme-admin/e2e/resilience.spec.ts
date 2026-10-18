/**
 * ADM-09 resilience (FRD T-07, T-04, T-05, T-09):
 * - server error → ErrorState with Retry and no numbers; clearing the fault + Retry recovers;
 * - timeout (response lost after commit) + retries → exactly ONE programme action;
 * - conflict on the next threshold write → ConflictNotice, nothing overwritten;
 * - browser offline (`context.setOffline(true)`) → dashboards still render from local data;
 * - session expiry → sign-in with the notice → back on the same filtered URL.
 */
import { expect, test, type Page } from "@playwright/test";

import { readStoreCollection, signInAs } from "./helpers.ts";

async function setFault(page: Page, label: string, level: "Off" | "Always") {
  await page.goto("/admin/settings");
  await page.getByLabel(label).selectOption({ label: level });
}

test("server error → ErrorState without figures; clear + Retry recovers", async ({ page }) => {
  await page.goto("/admin/settings");
  await signInAs(page, /Quavel Quoriqua/);
  await setFault(page, "Server error", "Always");
  await expect(page.getByTestId("fault-pill")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Overview" })
    .click();
  await expect(page.getByRole("alert").filter({ hasText: "Something went wrong" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByTestId("kpi-strip")).toHaveCount(0);

  await page.getByTestId("fault-pill").click();
  await page.getByRole("button", { name: "Clear all faults" }).click();
  await expect(page.getByTestId("fault-pill")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Overview" })
    .click();
  await expect(page.getByTestId("kpi-strip")).toBeVisible();
});

test("timeout + retry → a single programme action", async ({ page }) => {
  await page.goto("/admin/funnel/reviewed");
  await signInAs(page, /Quavel Quoriqua/);
  await page
    .getByTestId("district-row-dist-alpha")
    .getByRole("button", { name: /Demo District Alpha/ })
    .click();
  const row = page.getByTestId("facility-row-fac-alpha-1");
  await row.getByRole("button", { name: /Actions for/ }).click();
  await row.getByRole("button", { name: "Assign programme follow-up" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Category/).selectOption("supervision_visit");
  await dialog.getByLabel(/Title/).fill("Retry-safe supervision visit");
  // Every response is now lost after the write committed (the Settings "Timeout: Always"
  // fault, armed through the E2E seam because the modal dialog is open).
  const setFaults = (patch: Record<string, unknown>) =>
    page.evaluate(
      (p) =>
        (
          window as unknown as { __laifAdminE2E: { setFaults: (x: unknown) => Promise<unknown> } }
        ).__laifAdminE2E.setFaults(p),
      patch,
    );
  await setFaults({ timeoutRate: 1 });
  await dialog.getByRole("button", { name: "Assign follow-up" }).click();
  await expect(dialog.getByTestId("programme-action-error")).toBeVisible();
  // Retry (same idempotency key) while still timing out, then once the network is back.
  await dialog.getByRole("button", { name: /Retry/ }).click();
  await expect(dialog.getByTestId("programme-action-error")).toBeVisible();
  await setFaults({ timeoutRate: 0 });
  await dialog.getByRole("button", { name: /Retry/ }).click();
  await expect(page.getByText("Programme action assigned")).toBeVisible();
  const actions = await readStoreCollection<{ title: string }>(page, "programmeActions");
  expect(actions).toHaveLength(1);
  expect(actions[0]?.title).toBe("Retry-safe supervision visit");
  const created = (await readStoreCollection<{ action: string }>(page, "auditEvents")).filter(
    (e) => e.action === "admin.programme_action.created",
  );
  expect(created).toHaveLength(1);
});

test("conflict on the next threshold write → ConflictNotice; keep latest changes nothing", async ({
  page,
}) => {
  await page.goto("/admin/settings");
  await signInAs(page, /Vaqvox Varqezo/, /All districts in my scope/);
  await page.getByRole("checkbox", { name: /Conflict on the next threshold change/ }).check();
  await expect(page.getByTestId("fault-pill")).toBeVisible();
  await page.getByRole("spinbutton", { name: /New threshold/ }).fill("8");
  await page.getByRole("textbox", { name: /Justification/ }).fill("Conflict check for the demo.");
  await page.getByRole("button", { name: "Save threshold" }).click();
  await expect(page.getByText("The threshold was changed by someone else")).toBeVisible();
  await page.getByRole("button", { name: "Keep the latest version" }).click();
  await expect(page.getByTestId("threshold-form").getByText("k = 5").first()).toBeVisible();
  await expect(page.getByTestId("fault-pill")).toHaveCount(0);
});

test("browser offline: the dashboards still render from data on this device", async ({
  page,
  context,
}) => {
  await page.goto("/admin/overview");
  await signInAs(page, /Quavel Quoriqua/);
  await expect(page.getByTestId("kpi-strip")).toBeVisible();
  // The shell prefetches every page chunk after sign-in (no service worker in this prototype).
  await page.waitForFunction(
    () =>
      ["FunnelPage", "TimelinessPage", "SettingsPage"].every((chunk) =>
        performance.getEntriesByType("resource").some((e) => e.name.includes(chunk)),
      ),
    undefined,
    { timeout: 15_000 },
  );
  await context.setOffline(true);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("link", { name: "Pathway funnel" }).click();
  await expect(page.getByText("You are offline. Changes are saved on this device.")).toBeVisible();
  await expect(page.getByTestId("funnel-dismissed")).toBeVisible();
  await nav.getByRole("link", { name: "Timeliness" }).click();
  await expect(page.getByTestId("timeliness-page")).toBeVisible();
  await nav.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByTestId("kpi-strip")).toBeVisible();
  await context.setOffline(false);
});

test("session expiry → sign-in notice → back on the same filtered view", async ({ page }) => {
  await page.goto("/admin/settings?preset=30d");
  await signInAs(page, /Quavel Quoriqua/);
  await page.getByRole("button", { name: "Expire session now" }).click();
  await expect(page.getByTestId("session-expired-status")).toBeVisible();
  await page.goto("/admin/timeliness?preset=30d&type=bp");
  await expect(page).toHaveURL(/\/admin\/login\?/);
  await expect(page.getByTestId("session-expired-notice")).toHaveText(
    "Your demo session expired. Sign in again to continue.",
  );
  await page.getByRole("button", { name: "Start demo session" }).click();
  await expect(page).toHaveURL(/\/admin\/timeliness\?preset=30d&type=bp$/);
  await expect(page.getByTestId("timeliness-page")).toBeVisible();
});
