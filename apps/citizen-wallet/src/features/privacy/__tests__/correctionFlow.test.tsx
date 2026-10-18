/**
 * CTZ-07 correction flow (T-01, T-03, T-04, T-05, T-09): pick → describe → review → send.
 * - validation: short description / missing tick → translated inline errors (EN + RW), focus on
 *   the first error, nothing written;
 * - success: double tap → ONE request + ONE task + `correction.requested` / `task.created`
 *   sharing a correlation ID; "Request sent", `CR-xxxx`, record-unchanged note;
 * - duplicate: an open request for the item is shown before typing (Continue disabled); a race
 *   past that check is blocked by the repository (`citizen.correction.duplicate_blocked`);
 * - conflict toggle → conflict notice back on step 1, nothing written; resend works;
 * - server error → inline error + Retry with the SAME key → one request;
 * - representative: only Grace's items.
 */
import { CITIZEN_OVERLAY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditsOf, renderShell, type ShellView } from "../../../test/harness.tsx";
import { lastHref, resetRouter } from "../../../test/router-stub.tsx";
import { CorrectionFlowScreen } from "../CorrectionFlowScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});
const P1 = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.patientId;
const P4 = SEED_ANCHORS.CTZ_P4_REPRESENTED_PATIENT.patientId;
const AMENDED = CITIZEN_OVERLAY_IDS.amendedScreening;
const T = 10_000;

type Task = { id: string; kind: string; payload: { requestStatus?: string; targetId: string } };
const newTasks = async (view: ShellView) =>
  (await view.store.getAll<Task>("careTasks")).filter(
    (t) => t.kind === "correction_request" && t.payload.requestStatus === "submitted",
  );

async function openFlow(
  options: { persona?: string; targetType?: string; targetId?: string; ready?: string } = {},
) {
  return renderShell(
    <CorrectionFlowScreen
      {...(options.targetType === undefined ? {} : { initialTargetType: options.targetType })}
      {...(options.targetId === undefined ? {} : { initialTargetId: options.targetId })}
    />,
    {
      ...as(options.persona ?? PERSONA_IDS.citizen1),
      readyTestId: options.ready ?? "correction-form-stepper",
    },
  );
}

const type = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } });

async function describeAndReview(description = "I had not eaten before this check.") {
  await screen.findByTestId("correction-form", {}, { timeout: T });
  type("correction-description", description);
  fireEvent.click(screen.getByTestId("correction-understood"));
  fireEvent.click(screen.getByTestId("correction-continue-describe"));
  await screen.findByTestId("correction-review", {}, { timeout: T });
}

describe("correction request flow", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "more", "privacy", "corrections", "new"]));

  it("step 1 requires a choice; personal details can be picked", async () => {
    await openFlow();
    expect(screen.getByTestId("correction-picker")).toBeTruthy();
    fireEvent.click(screen.getByTestId("correction-continue-pick"));
    expect(screen.getByTestId("error-targetId").textContent).toBe(
      "Please choose what looks wrong.",
    );
    fireEvent.click(screen.getByRole("radio", { name: "My personal details" }));
    expect(screen.getByTestId("error-targetId").textContent).toBe("");
    fireEvent.click(screen.getByTestId("correction-continue-pick"));
    expect(await screen.findByTestId("correction-form", {}, { timeout: T })).toBeTruthy();
    expect(screen.getByTestId("correction-picked").textContent).toBe("My personal details");
  });

  it("short description + no tick → translated errors, focus on the first, nothing written", async () => {
    const view = await openFlow({
      targetType: "screening",
      targetId: AMENDED,
      ready: "correction-form",
    });
    type("correction-description", "abc");
    fireEvent.click(screen.getByTestId("correction-continue-describe"));
    expect(screen.getByTestId("error-description").textContent).toBe(
      "Please tell us a little more (at least 10 letters).",
    );
    expect(screen.getByTestId("error-understood").textContent).toBe(
      "Please tick the box to continue.",
    );
    expect(document.activeElement).toBe(screen.getByTestId("correction-description"));
    expect(screen.queryByTestId("correction-review")).toBeNull();
    expect(await newTasks(view)).toHaveLength(0);

    // Same errors in Kinyarwanda.
    await act(async () => view.services.i18n.setLanguage("rw"));
    fireEvent.click(screen.getByTestId("correction-continue-describe"));
    expect(screen.getByTestId("error-description").textContent).toBe(
      "Twongerere ibisobanuro (nibura inyuguti 10).",
    );
    expect(screen.getByTestId("error-understood").textContent).toBe(
      "Kanda ku kazu kugira ngo ukomeze.",
    );
    expect(await newTasks(view)).toHaveLength(0);
  });

  it("valid request, double tap → one request, one task, two audits sharing a correlation", async () => {
    const view = await openFlow({
      targetType: "screening",
      targetId: AMENDED,
      ready: "correction-form",
    });
    await describeAndReview("  I had not eaten before this check.  ");
    expect(screen.getByTestId("correction-summary").textContent).toContain(
      "I had not eaten before this check.",
    );
    const send = screen.getByTestId("correction-send");
    act(() => {
      fireEvent.click(send);
      fireEvent.click(send);
    });
    expect(await screen.findByTestId("correction-success", {}, { timeout: T })).toBeTruthy();
    expect(screen.getByTestId("correction-success-title").textContent).toBe("Request sent");
    expect(screen.getByTestId("correction-reference").textContent).toMatch(
      /^Reference CR-[0-9A-Z]{4}$/u,
    );
    expect(screen.getByTestId("record-unchanged").textContent).toContain(
      "Your record has not been changed. Your care team will review your request.",
    );
    const tasks = await newTasks(view);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.payload.targetId).toBe(AMENDED);
    const requested = (await auditsOf(view.store, "correction.requested")) as unknown as {
      entityId: string;
      correlationId: string;
    }[];
    const created = (await auditsOf(view.store, "task.created")) as unknown as {
      entityId: string;
      correlationId: string;
    }[];
    const mine = (list: typeof requested) => list.filter((e) => e.entityId === tasks[0]!.id);
    expect(mine(requested)).toHaveLength(1);
    expect(mine(created)).toHaveLength(1);
    expect(mine(requested)[0]?.correlationId).toBe(mine(created)[0]?.correlationId);

    fireEvent.click(screen.getByTestId("correction-view-request"));
    expect(lastHref()).toEqual({
      pathname: "/more/privacy/corrections/[requestId]",
      params: { requestId: tasks[0]!.id },
    });
  });

  it("an item with an open request shows 'You already asked…' with a link; Continue disabled", async () => {
    const probe = await openFlow();
    const open = (await probe.repo().listCorrectionRequests(P1)).find(
      (r) => r.status === "submitted",
    )!;
    probe.unmount();
    await openFlow({ targetType: open.targetType, targetId: open.targetId });
    const notice = await screen.findByTestId("duplicate-notice", {}, { timeout: T });
    expect(notice.textContent).toMatch(
      /You already asked about this on \d{1,2} [A-Z][a-z]{2} 2026/u,
    );
    expect(screen.getByTestId("correction-continue-pick").getAttribute("aria-disabled")).toBe(
      "true",
    );
    fireEvent.click(screen.getByTestId("duplicate-open"));
    expect(lastHref()).toEqual({
      pathname: "/more/privacy/corrections/[requestId]",
      params: { requestId: open.id },
    });
  });

  it("a request made elsewhere while reviewing is blocked by the repository (audited)", async () => {
    const view = await openFlow({
      targetType: "screening",
      targetId: AMENDED,
      ready: "correction-form",
    });
    await describeAndReview();
    const other = await view.repo().createCorrectionRequest(
      {
        patientId: P1,
        targetType: "screening",
        targetId: AMENDED,
        description: "Sent from another device first.",
      },
      "00000000-0000-4000-8000-00000000abcd",
    );
    fireEvent.click(screen.getByTestId("correction-send"));
    const notice = await screen.findByTestId("duplicate-notice", {}, { timeout: T });
    expect(notice.textContent).toContain("You already asked about this on");
    expect(await newTasks(view)).toHaveLength(1);
    expect(await auditsOf(view.store, "citizen.correction.duplicate_blocked")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("duplicate-open"));
    expect(lastHref()).toEqual({
      pathname: "/more/privacy/corrections/[requestId]",
      params: { requestId: other.data.id },
    });
  });

  it("conflict toggle → conflict notice on step 1, nothing written; checking again then sending works", async () => {
    const view = await openFlow({
      targetType: "screening",
      targetId: AMENDED,
      ready: "correction-form",
    });
    await describeAndReview();
    await view.repo().demo.setFaults({ conflictOnce: [{ entityType: "patient", entityId: P1 }] });
    fireEvent.click(screen.getByTestId("correction-send"));
    const notice = await screen.findByTestId("conflict-notice", {}, { timeout: T });
    expect(notice.textContent).toContain(
      "This item was updated by your care team. Please check it again before sending.",
    );
    expect(screen.getByTestId("correction-picker")).toBeTruthy();
    expect(await newTasks(view)).toHaveLength(0);
    expect(await auditsOf(view.store, "conflict.detected")).toHaveLength(1);

    fireEvent.click(screen.getByTestId("conflict-reload"));
    await waitFor(() => expect(screen.queryByTestId("conflict-notice")).toBeNull());
    fireEvent.click(screen.getByTestId("correction-continue-pick"));
    // The text typed before is kept.
    await screen.findByTestId("correction-form", {}, { timeout: T });
    expect(screen.getByTestId<HTMLTextAreaElement>("correction-description").value).toBe(
      "I had not eaten before this check.",
    );
    fireEvent.click(screen.getByTestId("correction-continue-describe"));
    await screen.findByTestId("correction-review", {}, { timeout: T });
    fireEvent.click(screen.getByTestId("correction-send"));
    await screen.findByTestId("correction-success", {}, { timeout: T });
    expect(await newTasks(view)).toHaveLength(1);
  });

  it("server error → inline error; Retry replays with the same key → one request", async () => {
    const view = await openFlow({
      targetType: "screening",
      targetId: AMENDED,
      ready: "correction-form",
    });
    await describeAndReview();
    const spy = vi.spyOn(view.repo(), "createCorrectionRequest");
    await view.repo().demo.setFaults({ serverErrorRate: 1 });
    fireEvent.click(screen.getByTestId("correction-send"));
    expect(
      await screen.findByText(
        "We could not send your request. Nothing was sent. Try again.",
        {},
        { timeout: T },
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("correction-send").textContent).toBe("Try again");
    expect(await newTasks(view)).toHaveLength(0);
    await view.repo().demo.setFaults({ serverErrorRate: 0 });
    fireEvent.click(screen.getByTestId("correction-send"));
    await screen.findByTestId("correction-success", {}, { timeout: T });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]?.[1]).toBe(spy.mock.calls[1]?.[1]);
    expect(await newTasks(view)).toHaveLength(1);
  });

  it("representative: only Grace's items; another patient's item is never preselected", async () => {
    const view = await openFlow({
      persona: PERSONA_IDS.citizenRep,
      targetType: "screening",
      targetId: AMENDED, // Marie's result — not reachable for Jean-Paul.
    });
    expect(screen.getByTestId("representative-banner")).toBeTruthy();
    expect(screen.getByTestId("correction-picker")).toBeTruthy();
    const radios = within(screen.getByTestId("correction-picker-group")).getAllByRole("radio");
    const targets = await view.repo().listCorrectionTargets(P4);
    expect(radios).toHaveLength(targets.length);
    expect(radios.every((r) => r.getAttribute("aria-checked") !== "true")).toBe(true);
    expect(
      targets.every(
        (t) =>
          (t.targetType === "screening" && t.observation.patientId === P4) ||
          (t.targetType === "care_instruction" && t.instruction.patientId === P4) ||
          (t.targetType === "patient" && t.targetId === P4),
      ),
    ).toBe(true);
  });
});
