/**
 * Consent withdrawn while a detail screen is open / deep-linked: the next-step and result
 * detail screens show the consent-required state ("You stopped sharing" + "Give consent
 * again") instead of staying on the loading skeleton. No health data is rendered.
 */
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResultDetailScreen } from "../features/health/ResultDetailScreen.tsx";
import { NextStepDetailScreen } from "../features/next-steps/NextStepDetailScreen.tsx";
import { renderShell } from "../test/harness.tsx";
import { resetRouter, routerLog } from "../test/router-stub.tsx";

vi.mock("expo-router", () => import("../test/router-stub.tsx"));

const STEP = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION;
const as = {
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(PERSONA_IDS.citizen1),
};

async function withdrawnStore() {
  const view = await renderShell(<span data-testid="ready" />, { ...as, readyTestId: "ready" });
  await act(async () => {
    await view
      .repo()
      .recordConsent(
        { patientId: STEP.patientId, action: "withdrawn" },
        "00000000-0000-4000-8000-0000000c0de5",
      );
  });
  view.unmount();
  return view.store;
}

describe("detail screens after consent withdrawal", () => {
  it("next step detail → consent-required state, Give consent again → /consent", async () => {
    resetRouter(["(app)", "(tabs)", "next-steps", "[instructionId]"]);
    const store = await withdrawnStore();
    await renderShell(<NextStepDetailScreen instructionId={STEP.careInstructionId} />, {
      ...as,
      store,
      readyTestId: "permission-denied",
    });
    expect(screen.getByText("You stopped sharing")).toBeTruthy();
    expect(screen.queryByTestId("instruction-detail")).toBeNull();
    fireEvent.click(screen.getByTestId("consent-required-give"));
    expect(routerLog.at(-1)).toEqual({ method: "push", href: "/consent" });
  });

  it("result detail → consent-required state (no skeleton)", async () => {
    resetRouter(["(app)", "(tabs)", "health", "[observationId]"]);
    const store = await withdrawnStore();
    await renderShell(<ResultDetailScreen observationId="any-result" />, {
      ...as,
      store,
      readyTestId: "permission-denied",
    });
    expect(screen.getByText("You stopped sharing")).toBeTruthy();
    expect(screen.queryByTestId("result-detail")).toBeNull();
  });
});
