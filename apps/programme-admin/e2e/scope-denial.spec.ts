/**
 * ADM-01 / WF-04: sign in as the District Alpha analyst, open a District Beta URL → 403 in place
 * (URL kept) and exactly one new `access.denied` in the IndexedDB audit table.
 */
import { expect, test } from "@playwright/test";

import { readStoreCollection, signInAs } from "./helpers.ts";

type Audit = { action: string; correlationId: string; actorId: string; outcome: string };

test("District Alpha analyst → District Beta URL shows 403 and one denied audit event", async ({
  page,
}) => {
  await page.goto("/admin/overview");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Foverview$/);
  await signInAs(page, /Quavel Quoriqua/);
  await expect(page).toHaveURL(/\/admin\/overview$/); // `next` wins over the home scope

  const started = (await readStoreCollection<Audit>(page, "auditEvents")).find(
    (e) => e.action === "session.started" && e.actorId === "persona-analyst-alpha",
  );
  expect(started).toBeDefined();

  await page.goto("/admin/overview?district=dist-beta");
  await expect(
    page.getByRole("heading", { level: 1, name: "Outside your authorised scope" }),
  ).toBeVisible();
  await expect(page.getByText("403 · Outside your authorised scope")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/overview\?district=dist-beta$/);
  await expect(page.getByTestId("demo-banner")).toBeVisible();

  const raw = await page.evaluate(() => window.localStorage.getItem("laif.admin.session") ?? "{}");
  const session = JSON.parse(raw) as { session?: { correlationId?: string } };
  const correlationId = session.session?.correlationId;
  expect(correlationId).toBeTruthy();
  await expect
    .poll(
      async () =>
        (await readStoreCollection<Audit>(page, "auditEvents")).filter(
          (e) => e.action === "access.denied" && e.correlationId === correlationId,
        ).length,
    )
    .toBe(1);
  // StrictMode / settling never adds a second event.
  await page.waitForTimeout(500);
  const denied = (await readStoreCollection<Audit>(page, "auditEvents")).filter(
    (e) => e.action === "access.denied" && e.correlationId === correlationId,
  );
  expect(denied).toHaveLength(1);
  expect(denied[0]).toMatchObject({ actorId: "persona-analyst-alpha", outcome: "denied" });

  // RW copy of the 403 page.
  await page.getByRole("button", { name: "Ikinyarwanda" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Ntabwo wemerewe kubona aya makuru" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();

  // Switch demo persona → programme lead → all districts → full scope.
  await page.getByRole("button", { name: "Switch demo persona", exact: true }).click();
  await signInAs(page, /Vaqvox Varqezo/, /All districts in my scope/);
  await page.goto("/admin/overview?district=dist-beta");
  await expect(page.getByTestId("scope-strip")).toContainText("Demo District Beta");
});
