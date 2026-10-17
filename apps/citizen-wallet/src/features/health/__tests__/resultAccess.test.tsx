/**
 * CTZ-03 result access: one `citizen.result.viewed` per detail open; the Next steps CTA only
 * for a result with an approved linked instruction; cross-patient deep link → PermissionDenied
 * + `access.denied` with no partial render (T-02); representative sees only the represented
 * patient; values announced with full unit names.
 */
import type { ReleasedObservation } from "@laif/domain";
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { makeCitizenRepo } from "@laif/test-utils";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { auditsOf, renderShell } from "../../../test/harness.tsx";
import { resetRouter, routerLog } from "../../../test/router-stub.tsx";
import { linkedInstruction } from "../useResults.ts";
import { ResultDetailScreen } from "../ResultDetailScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});
const P1 = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.patientId;
const P4 = SEED_ANCHORS.CTZ_P4_REPRESENTED_PATIENT.patientId;

let linked: ReleasedObservation;
let unlinked: ReleasedObservation;
let p4Result: ReleasedObservation;

beforeAll(async () => {
  const h = await makeCitizenRepo();
  const released = (await h.repo.listReleasedObservations(P1)).filter(
    (o): o is ReleasedObservation => o.kind === "released",
  );
  const steps = await h.repo.listApprovedInstructions(P1);
  linked = released.find((o) => o.label === "followUpAgreed" && linkedInstruction(o, steps))!;
  unlinked = released.find((o) => linkedInstruction(o, steps) === null)!;
  h.as(PERSONA_IDS.citizenRep);
  p4Result = (await h.repo.listReleasedObservations(P4)).find(
    (o): o is ReleasedObservation => o.kind === "released",
  )!;
  expect(linked && unlinked && p4Result).toBeTruthy();
});

const viewedOf = async (store: Parameters<typeof auditsOf>[0], id: string) =>
  ((await auditsOf(store, "citizen.result.viewed")) as unknown as { entityId: string }[]).filter(
    (e) => e.entityId === id,
  );

describe("result detail access", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "health", "[observationId]"]));

  it("CTZ-P1: one citizen.result.viewed per open; Next steps link for the linked result", async () => {
    const view = await renderShell(<ResultDetailScreen observationId={linked.id} />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "result-detail",
    });
    expect(screen.getByTestId("result-chip-followUpAgreed").textContent).toBe("Follow-up agreed");
    const bp = screen.getByTestId("reading-bloodPressure");
    expect(bp.getAttribute("aria-label")).toBe(
      `Blood pressure ${linked.readings.systolic} over ${linked.readings.diastolic} millimetres of mercury`,
    );
    expect(screen.getByTestId("reading-glucose").getAttribute("aria-label")).toMatch(
      /^Blood glucose \d+\.\d millimoles per litre$/u,
    );
    expect(screen.getByTestId("result-facts").textContent).toContain("Demo Health Centre Alpha-1");
    expect(screen.getByTestId("result-facts").textContent).toContain("Not fasting");
    expect(screen.getByTestId("review-provenance").textContent).toMatch(/, Clinician/u);
    expect(screen.getByTestId("not-diagnosis").textContent).toContain(
      "This result is not a diagnosis. Talk to your care team if you have questions.",
    );
    expect(screen.getByTestId("result-meaning").textContent).toContain(
      "Your care team wants to see you again about this result. See Next steps.",
    );
    fireEvent.click(screen.getByTestId("result-next-steps"));
    expect(routerLog.at(-1)).toEqual({ method: "push", href: "/next-steps" });
    fireEvent.click(screen.getByTestId("result-support"));
    expect(routerLog.at(-1)).toEqual({ method: "push", href: "/more" });

    await waitFor(async () => expect(await viewedOf(view.store, linked.id)).toHaveLength(1));
    // Window focus / reconnect while mounted never read (and log) again.
    const reads = vi.spyOn(view.repo(), "getObservation");
    await act(async () => {
      window.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(reads).not.toHaveBeenCalled();
    expect(await viewedOf(view.store, linked.id)).toHaveLength(1);
    const events = await view.repo().listAccessEvents(P1);
    expect(
      events.filter((e) => e.resourceId === linked.id && e.actorId === PERSONA_IDS.citizen1),
    ).toHaveLength(1);
  });

  it("Understand my result: generic sheet, no thresholds or judgement words", async () => {
    await renderShell(<ResultDetailScreen observationId={linked.id} />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "result-detail",
    });
    fireEvent.click(screen.getByTestId("understand-open"));
    const sheet = await screen.findByTestId("understand-sheet");
    const text = sheet.textContent ?? "";
    expect(text).toContain("Only your care team decides what your result means for you.");
    expect(text).toContain("Blood pressure check");
    expect(text).toContain("Blood glucose check");
    expect(text).not.toMatch(/\b(high|low|normal)\b|\d+\/\d+|\d+\.\d/iu);
  });

  it("no CTA when no approved instruction is linked to the result", async () => {
    await renderShell(<ResultDetailScreen observationId={unlinked.id} />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "result-detail",
    });
    expect(screen.queryByTestId("result-next-steps")).toBeNull();
    expect(screen.getByTestId("result-meaning").textContent).not.toContain("See Next steps");
  });

  it("CTZ-P4 → another patient's result id: PermissionDenied + access.denied, nothing rendered", async () => {
    const view = await renderShell(<ResultDetailScreen observationId={linked.id} />, {
      ...as(PERSONA_IDS.citizenRep),
      readyTestId: "permission-denied",
    });
    expect(screen.queryByTestId("result-detail")).toBeNull();
    expect(view.container.textContent).not.toMatch(/mmHg|mmol\/L|Follow-up agreed/u);
    expect(screen.getByText("This result is not part of the record you can see.")).toBeTruthy();
    await waitFor(async () => {
      const denied = (await auditsOf(view.store, "access.denied")) as unknown as {
        entityId: string;
        actorId: string;
      }[];
      expect(denied.filter((d) => d.entityId === linked.id)).toHaveLength(1);
      expect(denied[0]?.actorId).toBe(PERSONA_IDS.citizenRep);
    });
    expect(await viewedOf(view.store, linked.id)).toHaveLength(0);
  });

  it("CTZ-P4 own (represented) result: representative banner, Grace's data only", async () => {
    const view = await renderShell(<ResultDetailScreen observationId={p4Result.id} />, {
      ...as(PERSONA_IDS.citizenRep),
      readyTestId: "result-detail",
    });
    expect(screen.getByTestId("representative-banner").textContent).toContain(
      "Viewing for Qorzo Texaumbra",
    );
    const list = await view.repo().listReleasedObservations(P4);
    expect(list.every((o) => o.patientId === P4)).toBe(true);
    const events = (await view.repo().listAccessEvents(P4)).filter(
      (e) => e.actorId === PERSONA_IDS.citizenRep,
    );
    expect(events[0]).toMatchObject({ purpose: "representative_access", resourceId: p4Result.id });
  });

  it("a pending (unreleased) id → not-found state, no values", async () => {
    const view = await renderShell(
      <ResultDetailScreen
        observationId={SEED_ANCHORS.CTZ_P2_AWAITING_REVIEW_SCREENING.screeningId}
      />,
      { ...as(PERSONA_IDS.citizen2), readyTestId: "result-back" },
    );
    expect(screen.getByText("Result not available")).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/mmHg|mmol\/L/u);
  });
});
