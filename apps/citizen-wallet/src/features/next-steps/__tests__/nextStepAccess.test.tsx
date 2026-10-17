/**
 * CTZ-04 next-step access (T-02): CTZ-P1's draft (unreleased) referral, CTZ-P2's withdrawn step,
 * another patient's step and an unknown id all render the SAME PermissionDenied with no partial
 * render + one `access.denied`; an own approved step renders with one `citizen.next_step.viewed`.
 * The contact "Call" never dials — it opens a sheet that says it is a demo number.
 */
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Linking } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditsOf, renderShell } from "../../../test/harness.tsx";
import { resetRouter, routerLog } from "../../../test/router-stub.tsx";
import { NextStepDetailScreen } from "../NextStepDetailScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});
const APPOINTMENT = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId;
const DENIED_TEXT = "This step is not part of the record you can see.";

const deniedFor = async (store: Parameters<typeof auditsOf>[0], id: string) =>
  (
    (await auditsOf(store, "access.denied")) as unknown as { entityId: string; actorId: string }[]
  ).filter((d) => d.entityId === id);

describe("next step deep links", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "next-steps", "[instructionId]"]));

  it.each([
    [
      "CTZ-P1 → own draft referral",
      PERSONA_IDS.citizen1,
      SEED_ANCHORS.CTZ_P1_UNRELEASED_REFERRAL.referralId,
    ],
    [
      "CTZ-P2 → own withdrawn step",
      PERSONA_IDS.citizen2,
      SEED_ANCHORS.CTZ_P2_WITHDRAWN_INSTRUCTION.careInstructionId,
    ],
    ["CTZ-P4 → another patient's step", PERSONA_IDS.citizenRep, APPOINTMENT],
    ["CTZ-P1 → unknown id", PERSONA_IDS.citizen1, "no-such-step"],
  ])("%s: PermissionDenied + access.denied, nothing rendered", async (_label, persona, id) => {
    const view = await renderShell(<NextStepDetailScreen instructionId={id} />, {
      ...as(persona),
      readyTestId: "permission-denied",
    });
    expect(screen.getByText(DENIED_TEXT)).toBeTruthy();
    expect(screen.getByText("Step not available")).toBeTruthy();
    expect(screen.queryByTestId("instruction-detail")).toBeNull();
    expect(view.container.textContent).not.toMatch(/Demo Health Centre|Appointment at|Agreed by/u);
    await waitFor(async () => {
      const denied = await deniedFor(view.store, id);
      expect(denied).toHaveLength(1);
      expect(denied[0]?.actorId).toBe(persona);
    });
    expect(await auditsOf(view.store, "citizen.next_step.viewed")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("next-step-back"));
    expect(routerLog.at(-1)).toEqual({ method: "replace", href: "/next-steps" });
  });

  it("own approved step: detail, what to bring, contact card; one citizen.next_step.viewed", async () => {
    const view = await renderShell(<NextStepDetailScreen instructionId={APPOINTMENT} />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "instruction-detail",
    });
    expect(screen.getByTestId("instruction-text").textContent).toContain(
      "Your care team booked an appointment for you at Demo Health Centre Alpha-1.",
    );
    expect(screen.getByTestId("instruction-bring").textContent).toContain(
      "Bring your health booklet",
    );
    expect(screen.getByTestId("instruction-facts").textContent).toContain(
      "Monday 19 October 2026 · 10:30",
    );
    expect(screen.getByTestId("to-change").textContent).toContain(
      "To change this, contact your care team.",
    );
    const contact = screen.getByTestId("facility-contact");
    expect(contact.textContent).toContain("+250 700 000 001");
    expect(within(contact).getByTestId("demo-number-label").textContent).toBe(
      "Demo number — does not connect",
    );
    expect(contact.textContent).toContain("Monday to Friday, 07:00–17:00");
    expect(contact.textContent).toContain("Plot 1, Demo Road, Alpha District (synthetic)");
    await waitFor(async () =>
      expect(await auditsOf(view.store, "citizen.next_step.viewed")).toHaveLength(1),
    );
  });

  it("Call never dials: a sheet explains the demo number", async () => {
    const openURL = vi.spyOn(Linking, "openURL");
    await renderShell(<NextStepDetailScreen instructionId={APPOINTMENT} />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "instruction-detail",
    });
    fireEvent.click(screen.getByTestId("contact-call"));
    const sheet = await screen.findByTestId("contact-sheet");
    expect(sheet.textContent).toContain("Demo phone number");
    expect(sheet.textContent).toContain("Demo number — does not connect");
    expect(sheet.textContent).toContain("does not connect to a real phone line");
    expect(openURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("contact-sheet-close"));
    expect(openURL).not.toHaveBeenCalled();
  });
});
