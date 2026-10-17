/**
 * CLN-02 acceptance in Chromium (manual script of the phase): coordinator → Settings → Simulated
 * offline banner → off → WF-02 simulated worker update → Reset demo restores the baseline counts
 * → RW persists across reload (and the reset).
 */
import { expect, test } from "@playwright/test";

import { signIn } from "./helpers.ts";

test("settings: offline banner, WF-02 simulation, reset restores baseline, RW survives reload", async ({
  page,
}) => {
  await page.goto("/clinical/login?redirect=%2Fclinical%2Fsettings");
  await signIn(page, "Vexqa Zelqiqua", "Demo Health Centre Alpha-1");
  await expect(page).toHaveURL(/\/clinical\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  const pending = page.getByTestId("snapshot-pending-reviews");
  const wf02 = page.getByTestId("snapshot-wf02-version");
  await expect(wf02).toHaveText("3");
  const baselinePending = await pending.textContent();

  // Simulated offline → banner + pill; off again.
  const offline = page.getByRole("switch", { name: "Simulated offline" });
  await offline.check();
  await expect(page.getByText("Simulated offline — changes cannot be saved")).toBeVisible();
  await expect(page.getByTestId("faults-active-pill")).toBeVisible();
  await offline.uncheck();
  await expect(page.getByText("Simulated offline — changes cannot be saved")).toHaveCount(0);

  // WF-02: another (simulated) actor bumps the follow-up version.
  await page.getByRole("button", { name: "Simulate worker updating follow-up (WF-02)" }).click();
  await expect(page.getByText("Follow-up updated by a simulated worker (version 4)")).toBeVisible();
  await expect(wf02).toHaveText("4");

  // Reset demo → confirm → toast → baseline counts again.
  await page.getByRole("button", { name: "Reset demo…" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset the demo to its baseline?" });
  await dialog.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("Demo reset to baseline")).toBeVisible();
  await expect(wf02).toHaveText("3");
  await expect(pending).toHaveText(baselinePending ?? "");

  // Language: RW persists across a reload.
  await page.getByRole("radio", { name: "Ikinyarwanda" }).check();
  await expect(page.locator("html")).toHaveAttribute("lang", "rw");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "rw");
  await expect(page.getByRole("radio", { name: "Ikinyarwanda" })).toBeChecked();
});
