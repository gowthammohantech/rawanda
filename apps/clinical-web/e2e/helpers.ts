import { expect, type Page } from "@playwright/test";

/** Demo sign-in through the UI (persona card + facility select). */
export async function signIn(page: Page, personaName: string, facilityLabel?: string) {
  await expect(page.getByTestId("public-shell")).toBeVisible();
  await page.getByRole("button", { name: new RegExp(personaName) }).click();
  if (facilityLabel !== undefined) {
    await page
      .getByRole("combobox", { name: /Active facility/ })
      .selectOption({ label: facilityLabel });
  }
  await page.getByRole("button", { name: "Enter the clinical portal" }).click();
  await expect(page.getByTestId("app-shell")).toBeVisible();
}

/** The `window.__laifDemo` debug handle (E2E builds only; see `src/app/demo-tools.tsx`). */
type DemoHandle = {
  reset: () => Promise<boolean>;
  setFaults: (patch: Record<string, unknown>) => Promise<boolean>;
  getDemoState: () => Promise<{ epoch: number; signedIn: boolean }>;
};

/**
 * Clean state for a spec (CLN-11 task 8, REL-03 contract): open the app, call
 * `window.__laifDemo.reset()` and wait for the reset epoch. Leaves the browser on the sign-in.
 */
export async function resetDemo(page: Page) {
  await page.goto("/clinical/login");
  await page.waitForFunction(() => "__laifDemo" in window);
  const before = await page.evaluate(() =>
    (window as unknown as { __laifDemo: DemoHandle }).__laifDemo.getDemoState(),
  );
  const ok = await page.evaluate(() =>
    (window as unknown as { __laifDemo: DemoHandle }).__laifDemo.reset(),
  );
  expect(ok).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __laifDemo: DemoHandle }).__laifDemo
          .getDemoState()
          .then((s) => s.epoch),
      ),
    )
    .toBeGreaterThan(before.epoch);
}

/** Applies a FND-07 `FaultConfig` patch through the debug handle (deterministic faults). */
export async function setFaults(page: Page, patch: Record<string, unknown>) {
  await page.waitForFunction(() => "__laifDemo" in window);
  const ok = await page.evaluate(
    (p) => (window as unknown as { __laifDemo: DemoHandle }).__laifDemo.setFaults(p),
    patch,
  );
  expect(ok).toBe(true);
}

/** Demo sign-in straight onto `path` (via `?redirect=`). */
export async function signInTo(
  page: Page,
  path: string,
  personaName: string,
  facilityLabel?: string,
) {
  await page.goto(`/clinical/login?redirect=${encodeURIComponent(path)}`);
  await signIn(page, personaName, facilityLabel);
}

/** Switches persona through the top-bar PersonaSwitcher (demo role switch). */
export async function switchPersona(page: Page, personaName: string) {
  await page.getByRole("button", { name: /Switch demo persona/ }).click();
  await page.getByRole("menuitemradio", { name: new RegExp(personaName) }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(`${personaName}.*Switch demo persona`) }),
  ).toBeVisible();
}

/** Deterministic seed ids (FND-05 `SEED_ANCHORS`) and personas used across the CLN-11 suites. */
export const SEED = {
  WF01_REVIEW: "128f9395-8caf-55e9-9281-75958ca32593",
  WF01_PATIENT: { name: "Xellequ Varqoxe", syntheticId: "DEMO-P-0003" },
  WF01_FU: "0c37e8e7-ceac-5285-8c45-02e7ceb7090f",
  WF02_FU: "be6a851a-5d1f-5c8f-be5d-831a5d14fecd",
  WF03_REVIEW: "a77545b0-17cf-5766-a783-67b017db8e88",
  WF04: {
    id: "6ff7ed2e-0175-5c3f-afe9-eb2e0169bb7d",
    name: "Quavox Zuxoumbra",
    syntheticId: "DEMO-P-0033",
  },
  AMENDED_SCREENING_PATIENT: "cb5850fa-7735-5e17-8b4b-6efa772ad6b5",
} as const;

export const PERSONA = {
  clinicianA1: "Zorvel Quorandi",
  coordinator: "Vexqa Zelqiqua",
  nurseA2: "Quilra Xabezo",
  clinicianB1: "Tezrix Vorxoxe",
} as const;

export const ALPHA_1 = "Demo Health Centre Alpha-1";

/** Every clinical screen of spec §2.1 + Settings (CLN-11 a11y / responsive sweeps). */
export const ROUTE_IDS = [
  "queue",
  "patients",
  "patient",
  "review",
  "decision",
  "referrals",
  "tasks",
  "audit",
  "settings",
] as const;
export type RouteId = (typeof ROUTE_IDS)[number];

const READY: Record<RouteId, string | null> = {
  queue: "queue-results",
  patients: "patient-results",
  patient: "patient-header",
  review: "review-layout",
  decision: "decision-page",
  referrals: "referral-kpis",
  tasks: "task-kpis",
  audit: "audit-table",
  settings: null,
};

/** Waits until the route rendered its content (h1, its ready marker, no busy region in main). */
export async function waitForRoute(page: Page, id: RouteId) {
  await expect(page.locator("main h1").first()).toBeVisible();
  const ready = READY[id];
  if (ready !== null) await expect(page.getByTestId(ready).first()).toBeVisible();
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

/**
 * Opens a route as the signed-in clinician Alpha-1 (`patient` = first search result; `decision`
 * = WF-01, started first when it is still pending) and waits for it.
 */
export async function visitRoute(page: Page, id: RouteId) {
  switch (id) {
    case "patient": {
      await page.goto("/clinical/patients");
      await waitForRoute(page, "patients");
      await page.getByTestId("patient-row-link").first().click();
      break;
    }
    case "review":
      await page.goto(`/clinical/reviews/${SEED.WF01_REVIEW}`);
      break;
    case "decision": {
      await page.goto(`/clinical/reviews/${SEED.WF01_REVIEW}`);
      await waitForRoute(page, "review");
      const start = page.getByTestId("start-review");
      if ((await start.count()) > 0 && (await start.isEnabled())) {
        await start.click();
        await expect(page.getByTestId("review-status")).toHaveText(/In review|Birimo gusuzumwa/);
      }
      await page.goto(`/clinical/reviews/${SEED.WF01_REVIEW}/decision`);
      break;
    }
    default:
      await page.goto(`/clinical/${id}`);
  }
  await waitForRoute(page, id);
}

/** Reads every row of one store of the app's IndexedDB (`laif-clinical`) — test inspection only. */
export async function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(async (name) => {
    const open = indexedDB.open("laif-clinical");
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(new Error("indexedDB open failed"));
    });
    const rows: unknown[] = await new Promise((resolve) => {
      const req = db.transaction(name, "readonly").objectStore(name).getAll();
      req.onsuccess = () => resolve(req.result as unknown[]);
    });
    db.close();
    return rows;
  }, store) as Promise<T[]>;
}

export type StoredAudit = {
  action: string;
  entityId: string;
  changeSummary: unknown;
  correlationId: string | null;
};
