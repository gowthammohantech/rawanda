/**
 * CLN-10 audit explorer on the real app (memory store, StrictMode): facility scope (no Beta-1
 * rows for Alpha-1), read-only (no mutation controls), notice, `Denied access` chip shows the
 * WF-04 attempt, Kigali date-range validation, WF-01 correlation trail in order, nurse reviewer
 * cannot export, coordinator export → confirm → `export.generated` + toast.
 */
import type { AuditEvent } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { createMemoryStoreAdapter } from "@laif/repositories";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routes } from "../../../app/routes.ts";
import { auditEvents, renderApp } from "../../../test/render-app.tsx";
import { createTestClinicalRepo } from "../../../test/test-repository.ts";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const NURSE = { personaId: PERSONA_IDS.nurseAlpha2, facilityId: FACILITY_IDS.alpha2 };
const COORD = { personaId: PERSONA_IDS.coordAlpha, facilityId: FACILITY_IDS.alpha1 };
const WF01 = SEED_ANCHORS.WF01_FLAGGED_REVIEW;
const WF04 = SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT;

const tableRows = () =>
  within(screen.getByTestId("audit-table"))
    .queryAllByRole("row")
    .filter((row) => within(row).queryAllByRole("rowheader").length > 0);

beforeEach(() => {
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AuditExplorerPage", () => {
  it("Alpha-1 clinician: scoped rows, notice, read-only, no export; audit.viewed recorded", async () => {
    const { store } = await renderApp({ path: routes.audit(), signIn: CLINICIAN });
    await screen.findByTestId("audit-table");
    await waitFor(() => expect(tableRows().length).toBeGreaterThan(0));
    expect(screen.getByTestId("audit-notice").textContent).toContain(
      "does not prove tamper resistance",
    );
    const table = screen.getByTestId("audit-table");
    expect(table.textContent).not.toContain("Beta-1");
    expect(table.textContent).not.toContain("Demo District Hospital");
    // Read-only: no mutation affordances anywhere on the page.
    const page = screen.getByTestId("audit-page");
    for (const name of [/edit/i, /delete/i, /remove/i, /save/i]) {
      expect(within(page).queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByTestId("audit-export")).toBeNull();
    expect(screen.getByTestId("audit-export-unavailable").textContent).toBe(
      "Export requires coordinator role",
    );
    await waitFor(async () => expect(await auditEvents(store, "audit.viewed")).toHaveLength(1));
  });

  it("the WF-04 denied attempt appears under the Denied access chip", async () => {
    const store = createMemoryStoreAdapter();
    const { repo } = await createTestClinicalRepo(CLINICIAN, store);
    await expect(repo.getPatient(WF04.patientId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const user = userEvent.setup();
    const { router } = await renderApp({ path: routes.audit(), signIn: CLINICIAN, store });
    await screen.findByTestId("audit-table");
    await user.click(screen.getByTestId("audit-chip-deniedAccess"));
    await waitFor(() => expect(router.state.location.search).toContain("chip=deniedAccess"));
    expect(screen.getByTestId("audit-chip-deniedAccess").getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      const actions = tableRows().map(
        (row) => row.querySelector("[data-action]")?.getAttribute("data-action") ?? "",
      );
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.every((a) => a.endsWith(".denied"))).toBe(true);
      expect(actions).toContain("access.denied");
    });
    expect(screen.getByTestId("audit-table").textContent).toContain(WF04.patientId);
  });

  it("From after To shows the translated date-range error and keeps the URL", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp({ path: routes.audit(), signIn: CLINICIAN });
    await screen.findByTestId("audit-table");
    await user.type(screen.getByLabelText(/^From/), "2026-10-14");
    await user.type(screen.getByLabelText(/^To/), "2026-10-01");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(await screen.findByText("The start date must not be after the end date.")).toBeTruthy();
    expect(router.state.location.search).not.toContain("from=");
  });

  it("WF-01: filtering by the correlation shows review.started → review.decided → referral.created", async () => {
    const store = createMemoryStoreAdapter();
    const { repo } = await createTestClinicalRepo(CLINICIAN, store);
    const review = await repo.getReview(WF01.reviewId);
    const started = await repo.startReview(
      { reviewId: WF01.reviewId, expectedVersion: review?.review.version ?? 1 },
      crypto.randomUUID(),
    );
    const decided = await repo.decideReview(
      {
        kind: "refer",
        reviewId: WF01.reviewId,
        expectedVersion: started.entityVersion,
        destinationFacilityId: FACILITY_IDS.alpha2,
        referralReason: "Readings above the demo rule twice",
        dueAt: "2026-10-21T06:00:00.000Z",
        priority: "routine",
      },
      crypto.randomUUID(),
    );
    const decidedEvent = (await store.getAll<AuditEvent>("auditEvents")).find(
      (e) => e.id === decided.auditEventId,
    ) as AuditEvent;

    const user = userEvent.setup();
    await renderApp({
      path: `${routes.audit()}?correlationId=${decidedEvent.correlationId}&event=${decidedEvent.id}`,
      signIn: CLINICIAN,
      store,
    });
    const drawer = await screen.findByTestId("audit-event-drawer");
    expect(drawer.getAttribute("data-event-id")).toBe(decidedEvent.id);
    expect(drawer.textContent).toContain(decidedEvent.correlationId);
    expect(drawer.textContent).toContain("2026"); // Kigali timestamp
    await user.click(within(drawer).getByTestId("audit-view-trail"));
    const trail = await within(drawer).findByTestId("correlation-trail");
    const order = [...trail.querySelectorAll("[data-action]")].map((n) =>
      n.getAttribute("data-action"),
    );
    const idx = (a: string) => order.indexOf(a);
    expect(idx("review.started")).toBeGreaterThanOrEqual(0);
    expect(idx("review.started")).toBeLessThan(idx("review.decided"));
    expect(idx("review.decided")).toBeLessThan(idx("referral.created"));
  });

  it("nurse reviewer cannot export (UI); coordinator export records export.generated first", async () => {
    const nurse = await renderApp({ path: routes.audit(), signIn: NURSE });
    await screen.findByTestId("audit-table");
    expect(screen.queryByTestId("audit-export")).toBeNull();
    nurse.unmount();

    const user = userEvent.setup();
    const { store } = await renderApp({ path: routes.audit(), signIn: COORD });
    await screen.findByTestId("audit-table");
    const button = await screen.findByTestId("audit-export");
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await user.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Export the audit log as CSV?" });
    expect(within(dialog).getByTestId("audit-export-summary").textContent).toContain(
      "Demo Health Centre Alpha-1 (demo)",
    );
    await user.click(within(dialog).getByRole("button", { name: "Export CSV" }));
    expect(await screen.findByText("CSV exported · event recorded")).toBeTruthy();
    const generated = (await auditEvents(store, "export.generated")).filter(
      (e) => e.entityType === "export_audit" && e.actorId === PERSONA_IDS.coordAlpha,
    );
    expect(generated).toHaveLength(1);
    expect(generated[0]?.changeSummary).toMatchObject({ template: "audit_log" });
  });
});
