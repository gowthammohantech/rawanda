/**
 * CTZ-07 request detail (task 11, T-06): seeded resolved requests show their outcome; the
 * resolved-amended one links to the CTZ-06 "what changed" view with the ORIGINAL value kept;
 * a new request is at "Submitted" with the citizen's own words verbatim; another patient's
 * request is denied. "Something wrong?" on a result / next step opens the flow preselected.
 */
import { CITIZEN_OVERLAY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { makeCitizenRepo } from "@laif/test-utils";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditsOf, renderShell } from "../../../test/harness.tsx";
import { lastHref, resetRouter } from "../../../test/router-stub.tsx";
import { ResultDetailScreen } from "../../health/ResultDetailScreen.tsx";
import { NextStepDetailScreen } from "../../next-steps/NextStepDetailScreen.tsx";
import { CorrectionDetailScreen } from "../CorrectionDetailScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});
const P1 = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.patientId;
const T = 10_000;

describe("correction request detail", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "more", "privacy", "corrections"]));

  it("resolved-amended: Resolved stepper, outcome, and 'See what changed' shows the original", async () => {
    const view = await renderShell(
      <CorrectionDetailScreen requestId={CITIZEN_OVERLAY_IDS.resolvedAmendedCorrection} />,
      { ...as(PERSONA_IDS.citizen1), readyTestId: "correction-detail" },
    );
    expect(screen.getByTestId("correction-stepper").getAttribute("aria-label")).toBe(
      "Request progress: Resolved",
    );
    expect(screen.getByTestId("correction-resolution").textContent).toBe(
      "Your care team added that you had not eaten before this check (fasting).",
    );
    expect(screen.getByTestId("correction-description-text").textContent).toBe(
      "I had not eaten before this check, but it does not say fasting.",
    );
    expect(screen.queryByTestId("record-unchanged")).toBeNull();
    const seeChange = await screen.findByTestId("correction-see-change", {}, { timeout: T });
    fireEvent.click(seeChange);
    const sheet = within(await screen.findByTestId("change-detail-sheet", {}, { timeout: T }));
    expect(sheet.getByTestId("change-before").textContent).toBe("BeforeNot recorded");
    expect(sheet.getByTestId("change-after").textContent).toBe("AfterFasting");
    expect(sheet.getByText("Your earlier record is kept. Nothing was deleted.")).toBeTruthy();
    expect(await auditsOf(view.store, "citizen.correction.viewed")).toHaveLength(1);
    await waitFor(async () =>
      expect(await auditsOf(view.store, "citizen.change.viewed")).toHaveLength(1),
    );
  });

  it("resolved-no-change (CTZ-P2): outcome without a change link", async () => {
    await renderShell(
      <CorrectionDetailScreen requestId={CITIZEN_OVERLAY_IDS.resolvedNoChangeCorrection} />,
      { ...as(PERSONA_IDS.citizen2), readyTestId: "correction-detail" },
    );
    expect(screen.getAllByTestId("correction-status-chip")[0]?.textContent).toContain(
      "NO CHANGE NEEDED",
    );
    expect(screen.getByTestId("correction-resolution").textContent).toBe(
      "Your care team checked the time of the reading and it was correct.",
    );
    expect(screen.queryByTestId("correction-see-change")).toBeNull();
  });

  it("new request: Submitted, own words verbatim, record-unchanged note", async () => {
    const h = await makeCitizenRepo({ persona: PERSONA_IDS.citizen1 });
    const created = await h.repo.createCorrectionRequest(
      {
        patientId: P1,
        targetType: "patient",
        targetId: P1,
        description: "Mon année de naissance est fausse — 1987.",
        suggestedValue: "1987",
      },
      h.key(),
    );
    await renderShell(<CorrectionDetailScreen requestId={created.data.id} />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "correction-detail",
      store: h.store,
    });
    expect(screen.getByTestId("correction-stepper").getAttribute("aria-label")).toBe(
      "Request progress: Submitted",
    );
    expect(screen.getByTestId("correction-description-text").textContent).toBe(
      "Mon année de naissance est fausse — 1987.",
    );
    expect(screen.getByTestId("correction-suggested-text").textContent).toBe("1987");
    expect(screen.getByTestId("record-unchanged")).toBeTruthy();
  });

  it("another patient's request → not available (denied + audited)", async () => {
    const view = await renderShell(
      <CorrectionDetailScreen requestId={CITIZEN_OVERLAY_IDS.resolvedNoChangeCorrection} />,
      { ...as(PERSONA_IDS.citizen1) },
    );
    expect(
      await screen.findByText("This request is not part of your record.", {}, { timeout: T }),
    ).toBeTruthy();
    expect(screen.queryByTestId("correction-detail")).toBeNull();
    expect(await auditsOf(view.store, "access.denied")).toHaveLength(1);
  });
});

describe("'Something wrong?' entry points", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "health", "[observationId]"]));

  it("result detail → flow with the result preselected", async () => {
    await renderShell(<ResultDetailScreen observationId={CITIZEN_OVERLAY_IDS.amendedScreening} />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "result-detail",
    });
    fireEvent.click(screen.getByTestId("result-something-wrong"));
    expect(lastHref()).toEqual({
      pathname: "/more/privacy/corrections/new",
      params: { targetType: "screening", targetId: CITIZEN_OVERLAY_IDS.amendedScreening },
    });
  });

  it("next step detail → flow with the step preselected", async () => {
    const id = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId;
    await renderShell(<NextStepDetailScreen instructionId={id} />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "instruction-detail",
    });
    fireEvent.click(screen.getByTestId("next-step-something-wrong"));
    expect(lastHref()).toEqual({
      pathname: "/more/privacy/corrections/new",
      params: { targetType: "care_instruction", targetId: id },
    });
  });
});
