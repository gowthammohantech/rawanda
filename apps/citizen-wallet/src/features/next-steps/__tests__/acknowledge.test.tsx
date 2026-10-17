/**
 * CTZ-04 "I have read this": a double tap / replay writes ONE `nextStepAcks` row and ONE
 * `citizen.next_step.acknowledged` (T-04); the `conflict-next-write` toggle → ConflictNotice,
 * no ack row for the stale version, reload, then a fresh tap saves (T-05); a server error keeps
 * the idempotency key and Retry replays with the SAME key (T-09). The step status never changes.
 */
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditsOf, renderShell, type ShellView } from "../../../test/harness.tsx";
import { resetRouter } from "../../../test/router-stub.tsx";
import { NextStepDetailScreen } from "../NextStepDetailScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});
const STEP = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION;

const ackRows = async (view: ShellView) =>
  (await view.store.getAll<{ instructionId: string }>("nextStepAcks")).filter(
    (a) => a.instructionId === STEP.careInstructionId,
  );

async function openStep() {
  const view = await renderShell(<NextStepDetailScreen instructionId={STEP.careInstructionId} />, {
    ...as(PERSONA_IDS.citizen1),
    readyTestId: "instruction-detail",
  });
  return view;
}

describe("acknowledge a next step", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "next-steps", "[instructionId]"]));

  it("double tap → one ack row, one audit event, 'Read on …'; status unchanged", async () => {
    const view = await openStep();
    const button = screen.getByTestId("acknowledge");
    expect(button.textContent).toBe("I have read this");
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    const read = await screen.findByTestId("acknowledged", {}, { timeout: 10_000 });
    expect(read.textContent).toMatch(/^Read on 14 Oct 2026, \d\d:\d\d$/u);
    expect(screen.queryByTestId("acknowledge")).toBeNull();
    expect(await ackRows(view)).toHaveLength(1);
    const events = (await auditsOf(view.store, "citizen.next_step.acknowledged")) as unknown as {
      entityType: string;
      entityId: string;
      correlationId: string;
      changeSummary: { idempotencyKey: string };
    }[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: "care_instruction",
      entityId: STEP.careInstructionId,
    });
    expect(events[0]?.correlationId).toBeTruthy();
    expect(events[0]?.changeSummary.idempotencyKey).toBeTruthy();

    // Replaying the same action (same key) returns the same ack — still one row.
    const replay = await view
      .repo()
      .acknowledgeInstruction(
        { patientId: STEP.patientId, instructionId: STEP.careInstructionId, expectedVersion: 1 },
        events[0]!.changeSummary.idempotencyKey,
      );
    expect(replay.replayed).toBe(true);
    expect(await ackRows(view)).toHaveLength(1);
    expect(await auditsOf(view.store, "citizen.next_step.acknowledged")).toHaveLength(1);
    // Acknowledgement ≠ completion.
    const [step] = (await view.repo().listApprovedInstructions(STEP.patientId)).filter(
      (s) => s.id === STEP.careInstructionId,
    );
    expect(step).toMatchObject({ progress: "planned", status: "released", completion: null });
  });

  it("conflict toggle → conflict notice, no ack row; reload then a fresh tap saves once", async () => {
    const view = await openStep();
    await view
      .repo()
      .demo.setFaults({ conflictOnce: [{ entityType: "patient", entityId: STEP.patientId }] });
    fireEvent.click(screen.getByTestId("acknowledge"));
    const notice = await screen.findByTestId("conflict-notice", {}, { timeout: 10_000 });
    expect(notice.textContent).toContain(
      "Your care team updated this step. Please read the latest version.",
    );
    expect(await ackRows(view)).toHaveLength(0);
    expect(await auditsOf(view.store, "citizen.next_step.acknowledged")).toHaveLength(0);
    expect(await auditsOf(view.store, "conflict.detected")).toHaveLength(1);
    expect(screen.getByTestId("acknowledge").getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(screen.getByTestId("conflict-reload"));
    await waitFor(() => expect(screen.queryByTestId("conflict-notice")).toBeNull());
    expect(screen.getByTestId("instruction-detail")).toBeTruthy();
    fireEvent.click(screen.getByTestId("acknowledge"));
    await screen.findByTestId("acknowledged", {}, { timeout: 10_000 });
    expect(await ackRows(view)).toHaveLength(1);
  });

  it("server error keeps the key: inline error + Retry replays with the same key", async () => {
    const view = await openStep();
    const spy = vi.spyOn(view.repo(), "acknowledgeInstruction");
    await view.repo().demo.setFaults({ serverErrorRate: 1 });
    fireEvent.click(screen.getByTestId("acknowledge"));
    expect(
      await screen.findByText(
        "We could not save this. Nothing was changed. Try again.",
        {},
        { timeout: 10_000 },
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("acknowledge").textContent).toBe("Try again");
    expect(await ackRows(view)).toHaveLength(0);

    await view.repo().demo.setFaults({ serverErrorRate: 0 });
    fireEvent.click(screen.getByTestId("acknowledge"));
    await screen.findByTestId("acknowledged", {}, { timeout: 10_000 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]?.[1]).toBe(spy.mock.calls[1]?.[1]);
    expect(await ackRows(view)).toHaveLength(1);
    expect(await auditsOf(view.store, "citizen.next_step.acknowledged")).toHaveLength(1);
  });

  it("an already-read step shows 'Read on …' instead of the button", async () => {
    await renderShell(
      <NextStepDetailScreen
        instructionId={SEED_ANCHORS.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.careInstructionId}
      />,
      { ...as(PERSONA_IDS.citizen1), readyTestId: "instruction-detail" },
    );
    expect(screen.getByTestId("acknowledged").textContent).toMatch(/^Read on 30 Aug 2026/u);
    expect(screen.queryByTestId("acknowledge")).toBeNull();
    expect(screen.getByTestId("instruction-status").textContent).toContain(
      "Confirmed by your care team",
    );
  });
});
