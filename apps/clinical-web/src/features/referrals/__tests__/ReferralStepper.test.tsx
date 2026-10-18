/**
 * CLN-08 `ReferralStepper`: Created → Accepted → Scheduled → Completed with `aria-current="step"`
 * on the current status only, check marks for done steps, actors/timestamps from the audit
 * history, and the cancelled branch rendered as a terminal pill (no current step).
 */
import type { AuditEvent, Referral } from "@laif/domain";
import { createSeed, PERSONA_IDS } from "@laif/mock-data";
import { renderWithProviders } from "@laif/test-utils/web";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReferralStepper } from "../ReferralStepper.tsx";

const seed = createSeed();
const base = seed.referrals[0] as Referral;
const referral = (over: Partial<Referral>): Referral => ({
  ...base,
  requestedAt: "2026-10-10T08:00:00.000Z",
  appointmentAt: null,
  completedAt: null,
  completionEvidence: null,
  cancelled: null,
  ...over,
});

const event = (to: Referral["status"], at: string, actor = PERSONA_IDS.coordAlpha): AuditEvent =>
  ({
    id: `ev-${to}`,
    action: "referral.transitioned",
    actorId: actor,
    occurredAt: at,
    changeSummary: { from: "created", to },
    entityId: base.id,
    entityType: "referral",
    justification: null,
  }) as unknown as AuditEvent;

function steps() {
  const list = screen.getByRole("list", { name: "Referral progress" });
  return within(list).getAllByRole("listitem");
}

describe("ReferralStepper", () => {
  it("created: the Created step is current (aria-current=step), the rest upcoming", () => {
    renderWithProviders(
      <ReferralStepper
        referral={referral({ status: "created" })}
        history={[]}
        creatorId={PERSONA_IDS.clinAlpha1}
      />,
    );
    const items = steps();
    expect(items).toHaveLength(4);
    expect(items[0]?.getAttribute("aria-current")).toBe("step");
    expect(items[0]?.textContent).toContain("Created");
    expect(items.slice(1).map((li) => li.getAttribute("data-status"))).toEqual([
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it("scheduled: created + accepted done with actor/time, scheduled current", () => {
    renderWithProviders(
      <ReferralStepper
        referral={referral({ status: "scheduled", appointmentAt: "2026-10-20T07:00:00.000Z" })}
        history={[
          event("accepted", "2026-10-11T08:00:00.000Z"),
          event("scheduled", "2026-10-12T08:00:00.000Z"),
        ]}
      />,
    );
    const items = steps();
    expect(items.map((li) => li.getAttribute("data-status"))).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
    ]);
    expect(items[2]?.getAttribute("aria-current")).toBe("step");
    expect(items[1]?.textContent).toMatch(/Demo|·/u);
  });

  it("completed: every step done, none current", () => {
    renderWithProviders(
      <ReferralStepper
        referral={referral({
          status: "completed",
          completedAt: "2026-10-13T08:00:00.000Z",
          completionEvidence: {
            type: "clinician_confirmation",
            reference: "REF-123",
            outcome: "attended_seen",
            note: "",
            recordedBy: PERSONA_IDS.clinAlpha1,
            recordedAt: "2026-10-13T09:00:00.000Z",
          },
        })}
        history={[]}
      />,
    );
    expect(steps().every((li) => li.getAttribute("data-status") === "done")).toBe(true);
    expect(document.querySelector('[aria-current="step"]')).toBeNull();
  });

  it("cancelled branch: reached steps done, terminal CANCELLED pill, no current step", () => {
    renderWithProviders(
      <ReferralStepper
        referral={referral({
          status: "cancelled_with_reason",
          cancelled: { reasonCode: "patient_declined", reason: "Patient chose another clinic." },
        })}
        history={[
          event("accepted", "2026-10-11T08:00:00.000Z"),
          event("cancelled_with_reason", "2026-10-12T08:00:00.000Z"),
        ]}
      />,
    );
    expect(steps().map((li) => li.getAttribute("data-status"))).toEqual([
      "done",
      "done",
      "upcoming",
      "upcoming",
    ]);
    expect(document.querySelector('[aria-current="step"]')).toBeNull();
    const pill = screen.getByTestId("referral-cancelled-pill");
    expect(within(pill).getByText("Cancelled")).toBeTruthy();
  });
});
