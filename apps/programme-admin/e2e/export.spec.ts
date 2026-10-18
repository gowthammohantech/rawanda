/**
 * ADM-07 (FRD Scenario 2): District Alpha analyst → Reports → programme summary by facility →
 * preview → reason → Export; the downloaded CSV starts with the watermark, covers District Alpha
 * only (no District Beta id), has blank suppressed rows and a checksum trailer; the history shows
 * the row. As the facility manager the Export button is disabled.
 */
import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { signInAs } from "./helpers.ts";

test("aggregate export: watermark, District Alpha scope, suppression, history", async ({
  page,
}) => {
  await page.goto("/admin/reports?template=programme_summary");
  await signInAs(page, /Quavel Quoriqua/);
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();

  // 1. Template + granularity.
  await page.getByLabel("Granularity").selectOption("facility");
  await page.getByRole("button", { name: "Next" }).click();
  // 2. Preview.
  await expect(page.getByTestId("preview-row-count")).toHaveText("Rows: 14");
  await expect(page.getByTestId("report-preview")).toContainText("<5");
  await page.getByRole("button", { name: "Next" }).click();
  // 3. Reason: an empty submit is rejected, then district meeting + acknowledgement.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Choose a reason for the export")).toBeVisible();
  await page.getByRole("radio", { name: "District meeting" }).check();
  await page.getByRole("checkbox", { name: /aggregate figures only/ }).check();
  await page.getByRole("button", { name: "Next" }).click();

  // 4. Export and read the file.
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^laif-demo_programme_summary_dist-alpha_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_[0-9a-f]{8}\.csv$/,
  );
  const text = await readFile((await download.path()) ?? "", "utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff);
  const lines = text.slice(1).split("\r\n");
  expect(lines[0]).toBe("# DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE");
  expect(lines).toContain("# scope_districts=dist-alpha");
  expect(lines).toContain("# scope_facilities=fac-alpha-1;fac-alpha-2");
  expect(lines).toContain("# suppression_threshold=5");
  expect(lines.some((l) => l.startsWith("# export_id="))).toBe(true);
  expect(text).not.toContain("dist-beta");
  expect(text).not.toContain("fac-beta-1");
  const suppressed = lines.filter((l) => l.includes(",true,"));
  expect(suppressed.length).toBeGreaterThan(0);
  for (const line of suppressed) expect(line).toMatch(/,,true,,,demo-metrics-1$/);
  const trailer = lines.find((l) => l.startsWith("# END rows=14 "));
  expect(trailer).toMatch(/suppressed_cells=\d+ sha256=[0-9a-f]{64}$/);
  await expect(page.getByTestId("export-done")).toBeVisible();

  // 5. History row with the checksum.
  const history = page.getByTestId("export-history");
  await expect(history.getByText("GENERATED")).toBeVisible();
  const sha = /sha256=([0-9a-f]{64})/.exec(trailer ?? "")?.[1] ?? "";
  await expect(history.getByText(sha.slice(0, 12))).toBeVisible();
});

test("facility manager: preview-only, Export disabled", async ({ page }) => {
  await page.goto("/admin/reports");
  await signInAs(page, /Xelzo Xaboxe/);
  await expect(page.getByText("Preview only")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("preview-row-count")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: "Programme review" }).check();
  await page.getByRole("checkbox", { name: /aggregate figures only/ }).check();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("export-button")).toBeDisabled();
  await expect(page.getByText("Your role cannot export")).toBeVisible();
});
