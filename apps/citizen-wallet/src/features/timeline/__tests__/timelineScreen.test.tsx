/**
 * CTZ-06 Timeline tab on the real shell (memory store, seeded personas): CTZ-P1 rows (recorded,
 * reviewed, appointment WAITING, follow-up DONE "confirmed by your care team", reminder info
 * rows without a chip, one UPDATED), month sections + mono rail dates, filter chips with counts
 * that persist while switching tabs, filter-empty + "Show all", empty, loading skeleton,
 * server error + Retry, consent withdrawn, screen-reader labels naming the state, navigation,
 * `citizen.timeline.viewed` per focus, pull-to-refresh runs the reminder delivery; CTZ-P2.
 */
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emitDemoClockChanged } from "../../../state/events.ts";
import { auditsOf, renderShell, type ShellView } from "../../../test/harness.tsx";
import { resetRouter, routerLog } from "../../../test/router-stub.tsx";
import { useActivePatient } from "../../health/useResults.ts";
import { FORBIDDEN_TIMING_WORDS } from "../../next-steps/copy.ts";
import { TimelineScreen } from "../TimelineScreen.tsx";
import { useCitizenTimeline, type CitizenTimelineState } from "../useTimeline.ts";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const T = { timeout: 10_000 };
const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});
const APPOINTMENT = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId;
const FOLLOW_UP = SEED_ANCHORS.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.careInstructionId;

async function openTimeline(personaId: string = PERSONA_IDS.citizen1, ui = <TimelineScreen />) {
  const view = await renderShell(ui, as(personaId));
  await screen.findByTestId("timeline-filters", {}, T);
  return view;
}

const rowsWithState = (state: string) =>
  screen
    .queryAllByTestId(/^timeline-item-/u)
    .filter((row) => row.querySelector(`[data-testid="timeline-icon-${state}"]`));

const tab = (name: RegExp) => screen.getByRole("tab", { name });

describe("Timeline tab", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "timeline"]));

  it("CTZ-P1: recorded, reviewed, appointment WAITING, follow-up DONE, reminder info rows, one UPDATED", async () => {
    const view = await openTimeline();
    expect(screen.getAllByText("Check recorded").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reviewed by your care team").length).toBeGreaterThan(0);

    const appointment = screen.getByTestId(`timeline-item-step:${APPOINTMENT}`);
    expect(within(appointment).getByText("Appointment on 19 Oct 2026")).toBeTruthy();
    expect(within(appointment).getByText("WAITING")).toBeTruthy();
    expect(within(appointment).queryByText("DONE")).toBeNull();

    const followUp = screen.getByTestId(`timeline-item-step:${FOLLOW_UP}`);
    expect(within(followUp).getByText("Follow-up done — confirmed by your care team")).toBeTruthy();
    expect(within(followUp).getByText("DONE")).toBeTruthy();

    const reminders = screen.getAllByText("Reminder sent (demo)");
    expect(reminders).toHaveLength(2);
    for (const row of screen.getAllByTestId(/^timeline-item-reminder:/u)) {
      expect(within(row).queryByText("DONE")).toBeNull();
      expect(within(row).queryByTestId(/^timeline-chip-/u)).toBeNull();
      expect(row.getAttribute("aria-label")).toMatch(/^NOTE\. Reminder sent \(demo\)/u);
    }
    const read = screen.getByText("You read your next step");
    expect(read).toBeTruthy();
    expect(screen.getAllByText("UPDATED").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Your record was updated")).toHaveLength(1);

    // Never "overdue" / "missed" wording; no staff-internal states.
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(FORBIDDEN_TIMING_WORDS);
    expect(text).not.toMatch(/in_review|pending_review|flag|assigned|attempt/iu);
    // The draft (unreleased) referral never appears.
    expect(document.body.innerHTML).not.toContain(
      SEED_ANCHORS.CTZ_P1_UNRELEASED_REFERRAL.referralId,
    );
    // Month sections + mono rail dates.
    expect(screen.getByTestId("timeline-month-2026-10").textContent).toBe("October 2026");
    expect(within(appointment).getByText("OCT 4")).toBeTruthy();
    expect(screen.getByTestId("timeline-updated").textContent).toBe("Updated just now");
    await waitFor(async () =>
      expect(await auditsOf(view.store, "citizen.timeline.viewed")).toHaveLength(1),
    );
  });

  it("screen-reader labels start with the state; states differ by icon shape (greyscale)", async () => {
    await openTimeline();
    const appointment = screen.getByTestId(`timeline-item-step:${APPOINTMENT}`);
    expect(appointment.getAttribute("aria-label")).toMatch(
      /^Status: WAITING\. Appointment on 19 Oct 2026\. Agreed by .+ · 4 Oct 2026\. 4 Oct 2026$/u,
    );
    const followUp = screen.getByTestId(`timeline-item-step:${FOLLOW_UP}`);
    expect(followUp.getAttribute("aria-label")).toMatch(/^Status: DONE\. Follow-up done/u);
    for (const state of ["done", "waiting", "changed", "info"]) {
      expect(rowsWithState(state).length, state).toBeGreaterThan(0);
    }
  });

  it("filter chips show counts; Done shows only care-team-confirmed rows; Changes only UPDATED", async () => {
    await openTimeline();
    const allRows = screen.getAllByTestId(/^timeline-item-/u).length;
    expect(tab(/^All, \d+ items$/u).getAttribute("aria-label")).toBe(`All, ${allRows} items`);
    const doneCount = rowsWithState("done").length;
    const waitingCount = rowsWithState("waiting").length;
    expect(tab(/^Done,/u).getAttribute("aria-label")).toBe(`Done, ${doneCount} items`);
    expect(tab(/^Waiting,/u).getAttribute("aria-label")).toBe(`Waiting, ${waitingCount} items`);
    expect(tab(/^Changes,/u).getAttribute("aria-label")).toMatch(/^Changes, 2 items$/u);

    fireEvent.click(tab(/^Done,/u));
    await waitFor(() => expect(screen.getAllByTestId(/^timeline-item-/u)).toHaveLength(doneCount));
    expect(screen.queryByText("Reminder sent (demo)")).toBeNull();
    expect(screen.queryByText("You read your next step")).toBeNull();
    expect(screen.queryByText("WAITING")).toBeNull();

    fireEvent.click(tab(/^Changes,/u));
    await waitFor(() => expect(screen.getAllByTestId(/^timeline-item-/u)).toHaveLength(2));
    expect(screen.getAllByText("UPDATED")).toHaveLength(2);
  });

  it("the filter persists while switching tabs (wallet store, not the DB)", async () => {
    function Tabs() {
      const [onTimeline, setOnTimeline] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOnTimeline((v) => !v)}>
            switch-tab
          </button>
          {onTimeline ? <TimelineScreen /> : <span data-testid="other-tab" />}
        </>
      );
    }
    const view = await openTimeline(PERSONA_IDS.citizen1, <Tabs />);
    fireEvent.click(tab(/^Waiting,/u));
    await waitFor(() => expect(tab(/^Waiting,/u).getAttribute("aria-selected")).toBe("true"));
    fireEvent.click(screen.getByText("switch-tab"));
    expect(await screen.findByTestId("other-tab")).toBeTruthy();
    fireEvent.click(screen.getByText("switch-tab"));
    await screen.findByTestId("timeline-filters", {}, T);
    expect(tab(/^Waiting,/u).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("DONE")).toBeNull();
    expect(view.services.wallet.getState().timelineFilter).toBe("waiting");
    // One timeline view per focus.
    await waitFor(async () =>
      expect(await auditsOf(view.store, "citizen.timeline.viewed")).toHaveLength(2),
    );
  });

  it("filter empty → 'Nothing here for this filter.' + Show all", async () => {
    const view = await openTimeline(PERSONA_IDS.citizenRep);
    act(() => view.services.wallet.getState().setTimelineFilter("changes"));
    expect(await screen.findByText("Nothing here for this filter.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("timeline-show-all"));
    await waitFor(() =>
      expect(screen.getAllByTestId(/^timeline-item-/u).length).toBeGreaterThan(0),
    );
    expect(screen.getByTestId("representative-banner")).toBeTruthy();
  });

  it("loading = 4 skeleton rows; empty timeline copy", async () => {
    const view = await openTimeline();
    const repo = view.repo();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const spies = [
      vi.spyOn(repo, "listReleasedObservations").mockImplementation(() => gate.then(() => [])),
      vi.spyOn(repo, "listApprovedInstructions").mockResolvedValue([]),
      vi.spyOn(repo, "listReminders").mockResolvedValue([]),
      vi.spyOn(repo, "listCorrectionRequests").mockResolvedValue([]),
    ];
    void view.services.queryClient.resetQueries({
      predicate: (q) => q.queryKey[0] === "ctz" && q.queryKey.includes("patient"),
    });
    const loading = await screen.findByTestId("loading-state", {}, T);
    expect(loading.getAttribute("aria-busy")).toBe("true");
    release();
    expect(
      await screen.findByText("Your care history will appear here after your first check.", {}, T),
    ).toBeTruthy();
    expect(screen.queryByTestId("timeline-filters")).toBeNull();
    spies.forEach((s) => s.mockRestore());
  });

  it("server error → ErrorState + Retry recovers", async () => {
    const view = await openTimeline();
    await view.repo().demo.setFaults({ serverErrorRate: 1 });
    await view.services.queryClient.resetQueries({
      predicate: (q) => q.queryKey.includes("observations"),
    });
    expect(await screen.findByTestId("error-state", {}, T)).toBeTruthy();
    expect(screen.queryAllByTestId(/^timeline-item-/u)).toHaveLength(0);
    await view.repo().demo.setFaults({ serverErrorRate: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("timeline-filters", {}, T)).toBeTruthy();
  });

  it("consent withdrawn (CTZ-P3) → ConsentRequiredState, no rows", async () => {
    await renderShell(<TimelineScreen />, as(PERSONA_IDS.citizenWithdrawn));
    expect(await screen.findByTestId("consent-required-give", {}, T)).toBeTruthy();
    expect(screen.queryAllByTestId(/^timeline-item-/u)).toHaveLength(0);
  });

  it("tapping a row navigates via its link (next step / result / reminders)", async () => {
    await openTimeline();
    fireEvent.click(screen.getByTestId(`timeline-item-step:${APPOINTMENT}`));
    expect(routerLog.at(-1)).toMatchObject({
      method: "push",
      href: { pathname: "/next-steps/[instructionId]", params: { instructionId: APPOINTMENT } },
    });
    fireEvent.click(screen.getAllByTestId(/^timeline-item-recorded:/u)[0]!);
    expect(routerLog.at(-1)).toMatchObject({ href: { pathname: "/health/[observationId]" } });
    fireEvent.click(screen.getAllByTestId(/^timeline-item-reminder:/u)[0]!);
    expect(routerLog.at(-1)).toMatchObject({ href: { pathname: "/reminders" } });
  });

  it("refresh runs the reminder delivery + re-reads (demo clock +4 days → new info row, appointment still WAITING)", async () => {
    const api: { current: CitizenTimelineState | null } = { current: null };
    function Probe() {
      const patient = useActivePatient();
      api.current = useCitizenTimeline(patient?.patientId ?? null);
      return null;
    }
    const view: ShellView = await openTimeline(
      PERSONA_IDS.citizen1,
      <>
        <TimelineScreen />
        <Probe />
      </>,
    );
    const repo = view.repo();
    const process = vi.spyOn(repo, "processDueReminders");
    expect(screen.getAllByText("Reminder sent (demo)")).toHaveLength(2);
    await act(async () => {
      await repo.demo.advanceClock(4 * 86_400_000 + 3 * 3_600_000);
    });
    await act(async () => {
      await api.current!.refresh();
    });
    expect(process).toHaveBeenCalled();
    await waitFor(() => expect(screen.getAllByText("Reminder sent (demo)")).toHaveLength(3), T);
    const appointment = screen.getByTestId(`timeline-item-step:${APPOINTMENT}`);
    expect(within(appointment).getByText("WAITING")).toBeTruthy();
    expect(within(appointment).queryByText("DONE")).toBeNull();
    process.mockRestore();
  });

  it("a demo-clock change delivers due reminders without a manual refresh", async () => {
    const view = await openTimeline();
    await act(async () => {
      await view.repo().demo.advanceClock(4 * 86_400_000 + 3 * 3_600_000);
      emitDemoClockChanged();
    });
    await waitFor(() => expect(screen.getAllByText("Reminder sent (demo)")).toHaveLength(3), T);
  });

  it("CTZ-P2: dismissed review shown as reviewed; awaiting-review row WAITING without values", async () => {
    await openTimeline(PERSONA_IDS.citizen2);
    const dismissed = SEED_ANCHORS.CTZ_P2_DISMISSED_SCREENING.screeningId;
    const reviewed = screen.getByTestId(`timeline-item-reviewed:${dismissed}`);
    expect(within(reviewed).getByText("Reviewed by your care team")).toBeTruthy();
    expect(within(reviewed).getByText("DONE")).toBeTruthy();
    const awaiting = screen.getByTestId(
      `timeline-item-awaiting:${SEED_ANCHORS.CTZ_P2_AWAITING_REVIEW_SCREENING.screeningId}`,
    );
    expect(within(awaiting).getByText("Waiting for your care team to review a check")).toBeTruthy();
    expect(within(awaiting).getByText("WAITING")).toBeTruthy();
    expect(awaiting.textContent).not.toMatch(/mmHg|mmol|mg\/dL|\d+\/\d+/u);
    expect(screen.queryByText("Your record was updated")).toBeNull();
  });
});
