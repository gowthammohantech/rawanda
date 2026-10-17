/**
 * HWM-08 outcome form: conditional fields (evidence hidden until an outcome needs it; reason +
 * inline attempt for unable to reach; read-only destination for referred onward), field errors +
 * summary in EN and RW, Confirm disabled while invalid, the completion confirm sheet (Back /
 * Confirm, double tap → one op), the post-save toast + navigation, and the blocked state of a
 * completed task. Also the attempt form's save path.
 */
import type { FollowUp, SyncOperation } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { createTestRepository } from "@laif/test-utils";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "../../../session/useSession.ts";
import { routerLog } from "../../../test/router-stub.tsx";
import { renderShell } from "../../../test/shell-harness.tsx";
import { RecordAttemptScreen } from "../RecordAttemptForm.tsx";
import { RecordOutcomeScreen } from "../RecordOutcomeForm.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const WORKER = PERSONA_IDS.chwAlpha1A;
const TASK = "0976e711-6a18-54f8-8984-ed116a248c86";
const COMPLETED = "5b3b1169-bdf1-54ee-9b48-1369bdfc12b0";

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(WORKER, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

const seededStore = async (): Promise<StoreAdapter> => {
  const store = createMemoryStoreAdapter();
  await createTestRepository({
    appId: "worker",
    persona: WORKER,
    store,
    faults: { offline: true },
  });
  return store;
};

const renderOutcome = async (store: StoreAdapter, id = TASK) => {
  const view = await renderShell(
    <SignedIn>
      <RecordOutcomeScreen followUpId={id} />
    </SignedIn>,
    { store },
  );
  await screen.findByTestId("outcome-screen", {}, { timeout: 5000 });
  return view;
};

const choose = (group: string, label: string) =>
  fireEvent.click(within(screen.getByTestId(group)).getByRole("radio", { name: label }));
const switchTo = (language: "Ikinyarwanda" | "English") =>
  fireEvent.click(
    within(screen.getAllByTestId("language-switcher")[0]!).getByRole("radio", { name: language }),
  );
const followUpOps = (store: StoreAdapter, id = TASK) =>
  store.getAll<SyncOperation>("syncOperations").then((all) => all.filter((o) => o.entityId === id));

beforeEach(() => {
  routerLog.length = 0;
});

describe("RecordOutcomeForm (HWM-08)", () => {
  it("attended: evidence appears with the outcome; missing evidence → EN/RW errors, save disabled", async () => {
    const store = await seededStore();
    await renderOutcome(store);
    expect(screen.queryByTestId("outcome-evidence")).toBeNull();
    expect(screen.queryByTestId("outcome-occurredAt")).toBeNull();

    choose("outcome-type", "Attended");
    expect(screen.getByTestId("outcome-evidence")).toBeTruthy();
    expect(screen.getByTestId("outcome-occurredAt")).toBeTruthy();
    expect(screen.getByTestId("outcome-save").textContent).toBe("Review and complete");

    fireEvent.click(screen.getByTestId("outcome-save"));
    const summary = await screen.findByTestId("form-error-summary");
    expect(summary.textContent).toContain("Check the highlighted fields");
    expect(summary.textContent).toContain("Choose how the visit was confirmed");
    expect(screen.getByTestId("outcome-save").getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByTestId("confirm-completion-sheet")).toBeNull();

    switchTo("Ikinyarwanda");
    await waitFor(() =>
      expect(screen.getByTestId("form-error-summary").textContent).toContain(
        "Hitamo uko uruzinduko rwemejwe",
      ),
    );
    switchTo("English");
    await waitFor(() =>
      expect(screen.getByTestId("form-error-summary").textContent).toContain(
        "Choose how the visit was confirmed",
      ),
    );
    expect(await followUpOps(store)).toHaveLength(0);
  });

  it("confirm sheet: summary, Back keeps the form, double-tap Confirm → one op, toast + back to task", async () => {
    const store = await seededStore();
    await renderOutcome(store);
    choose("outcome-type", "Attended");
    choose("outcome-evidence", "Facility register checked");
    expect(screen.queryByTestId("form-error-summary")).toBeNull();

    fireEvent.click(screen.getByTestId("outcome-save"));
    const sheet = await screen.findByTestId("confirm-completion-sheet");
    expect(within(sheet).getByTestId("confirm-completion-effect").textContent).toBe(
      "This marks the follow-up as completed",
    );
    const summary = within(sheet).getByTestId("confirm-completion-summary").textContent ?? "";
    expect(summary).toContain("Attended");
    expect(summary).toContain("Facility register checked");
    expect(summary).toContain("2026");

    fireEvent.click(within(sheet).getByTestId("confirm-completion-back"));
    await waitFor(() => expect(screen.queryByTestId("confirm-completion-sheet")).toBeNull());
    expect(await followUpOps(store)).toHaveLength(0);

    fireEvent.click(screen.getByTestId("outcome-save"));
    const again = await screen.findByTestId("confirm-completion-sheet");
    const confirm = within(again).getByTestId("confirm-completion");
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(routerLog).toContainEqual({
        method: "replace",
        href: { pathname: "/tasks/[followUpId]", params: { followUpId: TASK } },
      }),
    );
    expect(await screen.findByText("Saved on this device")).toBeTruthy();
    expect(await followUpOps(store)).toHaveLength(1);
    const saved = (await store.get<FollowUp>("followUps", TASK))!;
    expect(saved).toMatchObject({
      status: "completed",
      clinicianConfirmation: { status: "pending" },
      outcome: { kind: "attended", evidenceType: "facility_register_checked" },
    });
  });

  it("unable to reach: reason + inline attempt required; saves attempt + outcome", async () => {
    const store = await seededStore();
    await renderOutcome(store);
    choose("outcome-type", "Unable to reach");
    expect(screen.queryByTestId("outcome-evidence")).toBeNull();
    expect(screen.getByTestId("outcome-caption-unable").textContent).toBe(
      "Your supervisor or clinician will decide next steps.",
    );
    expect(screen.getByTestId("outcome-inline-attempt")).toBeTruthy();
    fireEvent.click(screen.getByTestId("outcome-save"));
    const summary = await screen.findByTestId("form-error-summary");
    expect(summary.textContent).toContain("Record at least one unsuccessful attempt first");
    expect(summary.textContent).toContain("This field is required.");

    fireEvent.click(screen.getByTestId("outcome-inline-attempt-toggle"));
    choose("outcome-inline-method", "Home visit");
    fireEvent.click(screen.getByTestId("outcome-reason"));
    fireEvent.click(await screen.findByRole("radio", { name: "Moved away" }));
    await waitFor(() => expect(screen.queryByTestId("form-error-summary")).toBeNull());
    fireEvent.click(screen.getByTestId("outcome-save"));

    await waitFor(async () => expect(await followUpOps(store)).toHaveLength(2));
    const saved = (await store.get<FollowUp>("followUps", TASK))!;
    expect(saved.status).toBe("unable_to_reach");
    expect(saved.attempts.map((a) => a.result)).toEqual(["not_reached"]);
    expect(saved.outcome).toMatchObject({ kind: "unable_to_reach", reasonCode: "moved_away" });
  });

  it("referred onward: destination from the referral (read-only) + clinician caption", async () => {
    const store = await seededStore();
    await renderOutcome(store);
    choose("outcome-type", "Referred onward");
    expect(screen.getByTestId("outcome-destination-value").textContent).toBe(
      "Demo District Hospital Beta-1",
    );
    expect(screen.getByTestId("outcome-caption-referred").textContent).toBe(
      "The clinician confirms when the referral is complete.",
    );
    expect(screen.getByTestId("outcome-evidence")).toBeTruthy();
  });

  it("a completed task shows the blocking message instead of the form", async () => {
    const store = await seededStore();
    await renderOutcome(store, COMPLETED);
    expect(screen.getByTestId("outcome-blocked-completed").textContent).toContain(
      "already completed",
    );
    expect(screen.queryByTestId("outcome-type")).toBeNull();
  });
});

describe("RecordAttemptForm (HWM-08)", () => {
  it("required method/result; reached attempt saves locally and returns to the task", async () => {
    const store = await seededStore();
    await renderShell(
      <SignedIn>
        <RecordAttemptScreen followUpId={TASK} />
      </SignedIn>,
      { store },
    );
    await screen.findByTestId("attempt-screen", {}, { timeout: 5000 });
    expect(screen.getByTestId("attempt-note")).toBeTruthy();
    expect(screen.getByText("Short and factual. Do not record diagnoses.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("attempt-save"));
    expect((await screen.findByTestId("form-error-summary")).textContent).toContain(
      "This field is required.",
    );

    choose("attempt-method", "Phone");
    expect(screen.getByTestId("attempt-phone-simulated")).toBeTruthy();
    choose("attempt-result", "Reached");
    fireEvent.click(screen.getByTestId("attempt-save"));
    await waitFor(() =>
      expect(routerLog).toContainEqual({
        method: "replace",
        href: { pathname: "/tasks/[followUpId]", params: { followUpId: TASK } },
      }),
    );
    const saved = (await store.get<FollowUp>("followUps", TASK))!;
    expect(saved.status).toBe("contacted");
    expect(saved.attempts).toMatchObject([{ method: "phone", result: "reached" }]);
    expect(await followUpOps(store)).toHaveLength(1);
  });
});
