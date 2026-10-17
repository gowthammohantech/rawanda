/**
 * CLN-05 review queue: per tab the badge == the rows (asserted against the repository), filters
 * (assignee / search / facility) change counts and rows together, URL state survives reload and
 * back / forward, WF-04 never appears for Alpha-1 personas, WF01_FLAGGED_REVIEW is in Pending and
 * Assigned to me, empty states per tab, out-of-scope facility toast, one privacy-safe
 * `queue.viewed`, KPI strip + sidebar badge from the same counts.
 */
import { REVIEW_QUEUE_TABS, type Patient, type ReviewQueueTab } from "@laif/domain";
import { createSeed, FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import type { CareRepository, ReviewFilterInput } from "@laif/repositories";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { routes } from "../../../app/routes.ts";
import { auditEvents, renderApp } from "../../../test/render-app.tsx";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const COORDINATOR = { personaId: PERSONA_IDS.coordAlpha, facilityId: FACILITY_IDS.alpha1 };
const BETA = { personaId: PERSONA_IDS.clinBeta1, facilityId: FACILITY_IDS.beta1 };
const seed = createSeed();
const WF01 = SEED_ANCHORS.WF01_FLAGGED_REVIEW;
const WF04 = SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT;
const wf04Patient = seed.patients.find((p) => p.id === WF04.patientId) as Patient;
const wf01Patient = seed.patients.find((p) => p.id === WF01.patientId) as Patient;

const TAB_LABEL: Record<ReviewQueueTab, string> = {
  pending: "Pending",
  urgent: "Urgent",
  overdue: "Overdue",
  assigned: "Assigned to me",
  all: "All in scope",
};

const tab = (t: ReviewQueueTab) =>
  screen.getByRole("tab", { name: new RegExp(`^${TAB_LABEL[t]}`) });

/** Rows once the list has settled (not fetching). */
async function settledRows(): Promise<HTMLElement[]> {
  await waitFor(() => {
    const results = screen.getByTestId("queue-results");
    expect(results.getAttribute("aria-busy")).toBe("false");
  });
  return within(screen.getByTestId("queue-results")).queryAllByTestId("queue-row");
}

async function repoRowIds(
  repo: CareRepository,
  filter: ReviewFilterInput,
  t: ReviewQueueTab,
): Promise<string[]> {
  const page = await repo.listReviews({ ...filter, tab: t, pageSize: 200 });
  return page.items.map((r) => r.id);
}

describe("ReviewQueuePage", () => {
  it("lands on Pending; every tab badge == rows == repository (clinician Alpha-1)", async () => {
    const user = userEvent.setup();
    const { services } = await renderApp({ path: routes.queue(), signIn: CLINICIAN });
    const filter = { facilityIds: [FACILITY_IDS.alpha1] };
    const counts = await services.repo.countReviews(filter);
    expect(tab("pending").getAttribute("aria-selected")).toBe("true");

    for (const t of REVIEW_QUEUE_TABS) {
      await user.click(tab(t));
      const expected = await repoRowIds(services.repo, filter, t);
      expect(expected).toHaveLength(counts[t]);
      await waitFor(async () => expect(await settledRows()).toHaveLength(counts[t]));
      await waitFor(() => expect(tab(t).textContent).toBe(`${TAB_LABEL[t]}${counts[t]}`));
      const ids = (await settledRows()).map((row) => row.getAttribute("data-review-id"));
      expect(ids).toEqual(expected);
      if (counts[t] > 0) {
        expect(screen.getByTestId("queue-footer").textContent).toBe(
          `Showing ${counts[t]} of ${counts[t]} review${counts[t] === 1 ? "" : "s"}`,
        );
      }
    }
    // First row is not auto-expanded.
    expect(
      screen.queryAllByRole("button", { expanded: true }).filter((b) => b.closest("li")),
    ).toHaveLength(0);
  });

  it("KPI strip and sidebar badge show the unfiltered facility counts", async () => {
    const { services } = await renderApp({ path: routes.queue(), signIn: CLINICIAN });
    const counts = await services.repo.countReviews({ facilityIds: [FACILITY_IDS.alpha1] });
    const strip = screen.getByTestId("queue-kpis");
    await waitFor(() => expect(within(strip).getByText("Awaiting review")).toBeTruthy());
    const text = strip.textContent ?? "";
    expect(text).toContain("Urgent (demo protocol)");
    expect(text).toContain("Urgent per demo protocol — not clinically validated");
    expect(text).toContain("Overdue (derived)");
    expect(text).toContain("Reviewed this week");
    const value = (label: string) =>
      within(strip).getByText(label).closest("div")?.parentElement?.textContent ?? "";
    expect(value("Awaiting review")).toContain(String(counts.pending));
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    await waitFor(() =>
      expect(within(nav).getByRole("link", { name: /Review queue/ }).textContent).toContain(
        String(counts.pending),
      ),
    );
  });

  it("WF01_FLAGGED_REVIEW is in Pending and Assigned to me for the clinician", async () => {
    const user = userEvent.setup();
    await renderApp({ path: routes.queue(), signIn: CLINICIAN });
    const has = async () =>
      (await settledRows()).some((row) => row.getAttribute("data-review-id") === WF01.reviewId);
    await waitFor(async () => expect(await has()).toBe(true));
    await user.click(tab("assigned"));
    await waitFor(async () => expect(await has()).toBe(true));
  });

  it("WF-04: the Beta-1 patient never appears for Alpha-1 personas, in any tab or count", async () => {
    for (const signIn of [CLINICIAN, COORDINATOR]) {
      const user = userEvent.setup();
      const view = await renderApp({ path: routes.queue(), signIn });
      const beta = await view.services.repo.countReviews({});
      for (const t of REVIEW_QUEUE_TABS) {
        await user.click(tab(t));
        const rows = await settledRows();
        const ids = rows.map((row) => row.getAttribute("data-review-id"));
        expect(ids).not.toContain(WF04.reviewId);
        expect(rows.map((r) => r.textContent).join(" ")).not.toContain(wf04Patient.displayName);
        await waitFor(() => expect(tab(t).textContent).toBe(`${TAB_LABEL[t]}${beta[t]}`));
      }
      expect(document.body.textContent).not.toContain(wf04Patient.syntheticIdentifier);
      view.unmount();
    }
  });

  it("assignee and search change counts and rows consistently; URL keeps them; back restores", async () => {
    const user = userEvent.setup();
    const { services, router } = await renderApp({ path: routes.queue(), signIn: CLINICIAN });
    await settledRows();
    const fac = { facilityIds: [FACILITY_IDS.alpha1] };

    await user.selectOptions(screen.getByTestId("queue-assignee"), "me");
    await waitFor(() => expect(router.state.location.search).toBe("?assignee=me"));
    const mine = await services.repo.countReviews({
      ...fac,
      assignedClinicianId: PERSONA_IDS.clinAlpha1,
    });
    await waitFor(() => expect(tab("pending").textContent).toBe(`Pending${mine.pending}`));
    expect(await settledRows()).toHaveLength(mine.pending);

    await user.selectOptions(screen.getByTestId("queue-assignee"), "unassigned");
    const none = await services.repo.countReviews({ ...fac, assignedClinicianId: null });
    await waitFor(() => expect(tab("all").textContent).toBe(`All in scope${none.all}`));
    expect(await settledRows()).toHaveLength(none.pending);

    await user.selectOptions(screen.getByTestId("queue-assignee"), "any");
    await user.type(screen.getByTestId("queue-search"), wf01Patient.syntheticIdentifier);
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get("q")).toBe(
        wf01Patient.syntheticIdentifier,
      ),
    );
    const byPatient = await services.repo.countReviews({
      ...fac,
      q: wf01Patient.syntheticIdentifier,
    });
    await waitFor(() => expect(tab("pending").textContent).toBe(`Pending${byPatient.pending}`));
    const rows = await settledRows();
    expect(rows).toHaveLength(byPatient.pending);
    expect(rows.every((row) => row.textContent?.includes(wf01Patient.displayName))).toBe(true);

    await user.click(tab("all"));
    await user.selectOptions(screen.getByTestId("queue-sort"), "dueAt_asc");
    await waitFor(() =>
      expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({
        tab: "all",
        q: wf01Patient.syntheticIdentifier,
        sort: "dueAt_asc",
      }),
    );

    // Back → previous filter (tab=all without sort); back again → pending tab.
    await act(() => router.navigate(-1));
    await waitFor(() =>
      expect(screen.getByTestId<HTMLSelectElement>("queue-sort").value).toBe("flaggedAt_asc"),
    );
    expect(tab("all").getAttribute("aria-selected")).toBe("true");
    await act(() => router.navigate(-1));
    await waitFor(() => expect(tab("pending").getAttribute("aria-selected")).toBe("true"));
  });

  it("restores filters from the URL on load (reload)", async () => {
    await renderApp({
      path: `${routes.queue()}?tab=overdue&assignee=me&sort=dueAt_asc`,
      signIn: CLINICIAN,
    });
    expect(tab("overdue").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId<HTMLSelectElement>("queue-assignee").value).toBe("me");
    expect(screen.getByTestId<HTMLSelectElement>("queue-sort").value).toBe("dueAt_asc");
    await settledRows();
  });

  it("bad URL params are normalised silently; an out-of-scope facility is dropped with a toast", async () => {
    const { router } = await renderApp({
      path: `${routes.queue()}?tab=later&sort=risk&page=0&facility=${FACILITY_IDS.beta1}`,
      signIn: CLINICIAN,
    });
    expect(tab("pending").getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("Facility not in your scope")).toBeTruthy();
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).has("facility")).toBe(false),
    );
    expect(screen.getByTestId<HTMLSelectElement>("queue-facility").value).toBe(FACILITY_IDS.alpha1);
    await settledRows();
  });

  it("empty states per tab, with a link to All; filtered empty state clears filters", async () => {
    const user = userEvent.setup();
    const { services } = await renderApp({
      path: `${routes.queue()}?tab=urgent`,
      signIn: BETA,
    });
    const counts = await services.repo.countReviews({});
    expect(counts.urgent).toBe(0);
    expect(
      await screen.findByText("No urgent (demo protocol) reviews in Demo District Hospital Beta-1"),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show all in scope" }));
    await waitFor(() => expect(tab("all").getAttribute("aria-selected")).toBe("true"));
    await waitFor(async () => expect(await settledRows()).toHaveLength(counts.all));

    await user.type(screen.getByTestId("queue-search"), "zz-nobody");
    expect(
      await screen.findByText("No reviews match these filters in Demo District Hospital Beta-1"),
    ).toBeTruthy();
    await waitFor(() => expect(tab("all").textContent).toBe("All in scope0"));
  });

  it("coordinator: the facility filter offers Alpha-1 and Alpha-2 and switches scope", async () => {
    const user = userEvent.setup();
    const { router, services } = await renderApp({ path: routes.queue(), signIn: COORDINATOR });
    const select = screen.getByTestId<HTMLSelectElement>("queue-facility");
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Demo Health Centre Alpha-1",
      "Demo Health Centre Alpha-2",
    ]);
    await settledRows();
    await user.selectOptions(select, FACILITY_IDS.alpha2);
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get("facility")).toBe(
        FACILITY_IDS.alpha2,
      ),
    );
    expect(services.session.state()?.activeFacilityId).toBe(FACILITY_IDS.alpha2);
    const counts = await services.repo.countReviews({ facilityIds: [FACILITY_IDS.alpha2] });
    await waitFor(() => expect(tab("pending").textContent).toBe(`Pending${counts.pending}`));
    const rows = await settledRows();
    expect(rows).toHaveLength(counts.pending);
  });

  it("records one queue.viewed per mount with a filter summary and no patient data", async () => {
    const user = userEvent.setup();
    const { store } = await renderApp({ path: routes.queue(), signIn: CLINICIAN });
    await settledRows();
    await waitFor(async () => expect(await auditEvents(store, "queue.viewed")).toHaveLength(1));
    await user.click(tab("all"));
    await settledRows();
    const events = await auditEvents(store, "queue.viewed");
    expect(events).toHaveLength(1);
    expect(events[0]?.changeSummary).toMatchObject({ tab: "pending", assignee: "any" });
    const json = JSON.stringify(events[0]);
    expect(json).not.toContain(wf01Patient.displayName);
    expect(json).not.toContain(wf01Patient.syntheticIdentifier);
    expect(events[0]?.patientId ?? null).toBeNull();
  });
});
