/**
 * CTZ-04 date-passed notice: with the demo clock advanced past the appointment (demo tools
 * +7 days) the card and the detail show the neutral notice; no "overdue" / "missed" wording
 * anywhere in either language; nothing before the date.
 */
import { resources, type Language } from "@laif/i18n";
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { makeCitizenRepo } from "@laif/test-utils";
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderShell } from "../../../test/harness.tsx";
import { resetRouter } from "../../../test/router-stub.tsx";
import { FORBIDDEN_TIMING_WORDS } from "../copy.ts";
import { NextStepDetailScreen } from "../NextStepDetailScreen.tsx";
import { NextStepsListScreen } from "../NextStepsListScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});
const STEP = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId;
const DAY_MS = 86_400_000;
const NOTICE =
  "The date for this step has passed. Your care team will contact you, or you can contact them.";

async function storeAdvancedBy(days: number) {
  const h = await makeCitizenRepo();
  await h.repo.demo.advanceClock(days * DAY_MS);
  return h.store;
}

describe("date-passed notice", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "next-steps"]));

  it("demo clock +7 days → card and detail show the neutral notice, never overdue/missed", async () => {
    const store = await storeAdvancedBy(7);
    const list = await renderShell(<NextStepsListScreen />, {
      ...as(PERSONA_IDS.citizen1),
      store,
      readyTestId: "next-steps-list",
    });
    const card = screen.getByTestId(`next-step-card-${STEP}`);
    expect(within(card).getByTestId("date-passed").textContent).toBe(NOTICE);
    expect(list.container.textContent).not.toMatch(FORBIDDEN_TIMING_WORDS);
    // Still planned (Upcoming), never moved to Done by the date passing.
    expect(
      within(screen.getByTestId("section-upcoming")).getByTestId(`next-step-card-${STEP}`),
    ).toBeTruthy();
    list.unmount();

    const detail = await renderShell(<NextStepDetailScreen instructionId={STEP} />, {
      ...as(PERSONA_IDS.citizen1),
      store,
      readyTestId: "instruction-detail",
    });
    expect(screen.getByTestId("date-passed").textContent).toBe(NOTICE);
    expect(detail.container.textContent).not.toMatch(FORBIDDEN_TIMING_WORDS);
  });

  it("before the date: no notice", async () => {
    await renderShell(<NextStepsListScreen />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "next-steps-list",
    });
    expect(screen.queryByTestId("date-passed")).toBeNull();
  });

  it.each<Language>(["en", "rw"])("%s next-steps copy never says overdue / missed", (lng) => {
    const citizen = resources[lng].citizen as { nextSteps: unknown; nextStep: unknown };
    const text = JSON.stringify([citizen.nextSteps, citizen.nextStep]);
    expect(text).not.toMatch(FORBIDDEN_TIMING_WORDS);
    expect(text).not.toMatch(/yarenze igihe|yasibye/iu);
  });
});
