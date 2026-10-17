/**
 * CTZ-04 Next steps list: approved-only (CTZ-P1's draft referral and CTZ-P2's withdrawn step
 * never render), Upcoming → Done → Cancelled grouping with counts, the completed follow-up
 * "Confirmed by your care team", empty state + Support link, error + Retry, one
 * `citizen.next_step.list_viewed` per focus, and the My health "YOUR NEXT STEP" home card.
 */
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { anInstruction, makeCitizenRepo } from "@laif/test-utils";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditsOf, renderShell } from "../../../test/harness.tsx";
import { resetRouter, routerLog } from "../../../test/router-stub.tsx";
import { HealthListScreen } from "../../health/HealthListScreen.tsx";
import { NextStepsListScreen } from "../NextStepsListScreen.tsx";
import { groupNextSteps, nearestUpcoming } from "../useNextSteps.ts";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});
const APPOINTMENT = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId;
const COMPLETED = SEED_ANCHORS.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.careInstructionId;
const DRAFT_REFERRAL = SEED_ANCHORS.CTZ_P1_UNRELEASED_REFERRAL.referralId;
const WITHDRAWN = SEED_ANCHORS.CTZ_P2_WITHDRAWN_INSTRUCTION.careInstructionId;
const P2 = SEED_ANCHORS.CTZ_P2_DISMISSED_SCREENING.patientId;

describe("Next steps list", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "next-steps"]));

  it("CTZ-P1: approved 19 Oct appointment + completed follow-up; no draft referral", async () => {
    const view = await renderShell(<NextStepsListScreen />, as(PERSONA_IDS.citizen1));
    const list = await screen.findByTestId("next-steps-list", {}, { timeout: 10_000 });

    const upcoming = within(list).getByTestId("section-upcoming");
    expect(upcoming.textContent).toContain("Upcoming (1)");
    const card = within(upcoming).getByTestId(`next-step-card-${APPOINTMENT}`);
    expect(card.textContent).toContain("Your next step");
    expect(card.textContent).toContain("Appointment at Demo Health Centre Alpha-1");
    expect(within(card).getByTestId("appointment-row").textContent).toBe(
      "Monday 19 October 2026 · 10:30 · Demo Health Centre Alpha-1",
    );
    expect(within(card).getByTestId("approved-chip").textContent).toContain(
      "Approved by your care team",
    );
    expect(within(card).getByTestId("approved-by").textContent).toMatch(/^Agreed by .+ · 4 Oct/u);
    expect(within(card).queryByTestId("date-passed")).toBeNull();

    const done = within(list).getByTestId("section-done");
    expect(done.textContent).toContain("Done (1)");
    const row = within(done).getByTestId(`completed-step-${COMPLETED}`);
    expect(row.textContent).toContain("Confirmed by your care team");
    expect(row.textContent).toMatch(/Done on \d+ \w+ 2026/u);
    expect(within(list).queryByTestId("section-cancelled")).toBeNull();

    // Only the two approved steps; the unreleased referral never reaches the screen.
    expect(view.container.innerHTML).not.toContain(DRAFT_REFERRAL);
    expect(
      within(list).getAllByTestId(/^(next-step-card|completed-step|cancelled-step)-/u),
    ).toHaveLength(2);

    fireEvent.click(within(card).getByTestId(`next-step-open-${APPOINTMENT}`));
    expect(routerLog.at(-1)).toEqual({
      method: "push",
      href: { pathname: "/next-steps/[instructionId]", params: { instructionId: APPOINTMENT } },
    });
    await waitFor(async () =>
      expect(await auditsOf(view.store, "citizen.next_step.list_viewed")).toHaveLength(1),
    );
  });

  it("CTZ-P2: the withdrawn step is never shown", async () => {
    const view = await renderShell(<NextStepsListScreen />, as(PERSONA_IDS.citizen2));
    const list = await screen.findByTestId("next-steps-list", {}, { timeout: 10_000 });
    expect(view.container.innerHTML).not.toContain(WITHDRAWN);
    expect(within(list).getAllByTestId(/^next-step-card-/u)).toHaveLength(1);
    expect(within(list).queryByTestId("section-cancelled")).toBeNull();
  });

  it("CTZ-P2 with nothing else approved: empty state with Support link", async () => {
    const h = await makeCitizenRepo({ persona: PERSONA_IDS.citizen2 });
    for (const step of await h.repo.listApprovedInstructions(P2)) {
      await h.store.delete("careInstructions", step.id);
    }
    await renderShell(<NextStepsListScreen />, { ...as(PERSONA_IDS.citizen2), store: h.store });
    expect(
      await screen.findByText(
        "Your care team has not shared any next steps. If you were told to come back, contact them.",
        {},
        { timeout: 10_000 },
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("next-steps-support"));
    expect(routerLog.at(-1)).toEqual({ method: "push", href: "/more" });
    expect(screen.queryByTestId(`next-step-card-${WITHDRAWN}`)).toBeNull();
  });

  it("server error (fault error500) → error state + Retry recovers", async () => {
    const view = await renderShell(<NextStepsListScreen />, as(PERSONA_IDS.citizen1));
    await screen.findByTestId("next-steps-list", {}, { timeout: 10_000 });
    await view.repo().demo.setFaults({ serverErrorRate: 1 });
    await view.services.queryClient.resetQueries({
      predicate: (q) => q.queryKey.includes("instructions"),
    });
    expect(
      await screen.findByText(
        "We could not load your next steps. Nothing was changed. Try again.",
        {},
        { timeout: 10_000 },
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId("next-steps-list")).toBeNull();
    await view.repo().demo.setFaults({ serverErrorRate: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("next-steps-list", {}, { timeout: 10_000 })).toBeTruthy();
  });

  it("My health: the nearest upcoming approved step card links to Next steps", async () => {
    resetRouter(["(app)", "(tabs)", "health"]);
    await renderShell(<HealthListScreen />, as(PERSONA_IDS.citizen1));
    const card = await screen.findByTestId("home-next-step", {}, { timeout: 10_000 });
    expect(card.textContent).toContain("Your next step");
    expect(card.textContent).toContain("Monday 19 October 2026 · 10:30");
    fireEvent.click(within(card).getByTestId(`next-step-open-${APPOINTMENT}`));
    expect(routerLog.at(-1)).toEqual({
      method: "push",
      href: { pathname: "/next-steps/[instructionId]", params: { instructionId: APPOINTMENT } },
    });
  });
});

describe("groupNextSteps", () => {
  it("upcoming soonest first (undated last), then done newest first, then cancelled", () => {
    const later = anInstruction({ id: "a" as never, appointmentAt: "2026-10-25T08:00:00.000Z" });
    const sooner = anInstruction({ id: "b" as never, appointmentAt: "2026-10-16T08:00:00.000Z" });
    const undated = anInstruction({ id: "c" as never, appointmentAt: null });
    const doneOld = anInstruction({
      id: "d" as never,
      progress: "completed",
      completion: { completedAt: "2026-09-01T08:00:00.000Z", evidenceType: null },
    });
    const doneNew = anInstruction({
      id: "e" as never,
      progress: "completed",
      completion: {
        completedAt: "2026-10-01T08:00:00.000Z",
        evidenceType: "facility_attendance_record",
      },
    });
    const cancelled = anInstruction({ id: "f" as never, progress: "cancelled" });
    const groups = groupNextSteps([later, doneOld, undated, cancelled, sooner, doneNew]);
    expect(groups.upcoming.map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(groups.done.map((s) => s.id)).toEqual(["e", "d"]);
    expect(groups.cancelled.map((s) => s.id)).toEqual(["f"]);
    expect(nearestUpcoming([later, sooner])?.id).toBe("b");
    expect(nearestUpcoming([doneNew, cancelled])).toBeNull();
  });

  it("an acknowledged planned step stays upcoming (acknowledgement is not completion)", () => {
    const read = anInstruction({
      acknowledgement: { id: "ack", acknowledgedAt: "2026-10-14T06:00:00.000Z" },
    });
    expect(groupNextSteps([read]).upcoming).toHaveLength(1);
    expect(groupNextSteps([read]).done).toHaveLength(0);
  });
});
