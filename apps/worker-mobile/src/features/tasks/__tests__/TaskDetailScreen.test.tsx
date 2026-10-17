/**
 * HWM-07 task detail: own task (header micro-labels, derived OVERDUE pill + caption, patient
 * card with latest reading + units, referral "Set by clinician", attempt timeline newest first,
 * actions) with exactly one `followup.viewed`; completed task (outcome with evidence, no
 * actions); denied path for another worker's task (`access.denied`, no patient data — T-02);
 * and the RW relative-date fallback when `Intl` lacks Kinyarwanda.
 */
import type { AuditEvent, FollowUp, Patient } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { createTestRepository } from "@laif/test-utils";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DeniedRoute from "../../../../app/(app)/denied.tsx";
import { useSession } from "../../../session/useSession.ts";
import { routerLog, searchParams } from "../../../test/router-stub.tsx";
import { renderShell } from "../../../test/shell-harness.tsx";
import { formatRelativeDays, intlRelativeLocale } from "../relativeDays.ts";
import { TaskDetailScreen } from "../TaskDetailScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const WORKER = PERSONA_IDS.chwAlpha1A;

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(WORKER, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

const seededStore = async (): Promise<StoreAdapter> => {
  const store = createMemoryStoreAdapter();
  await createTestRepository({ appId: "worker", persona: WORKER, store });
  return store;
};

const mine = async (store: StoreAdapter, pick: (f: FollowUp) => boolean) =>
  (await store.getAll<FollowUp>("followUps")).find(
    (f) => f.assignedWorkerId === WORKER && pick(f),
  )!;

const renderDetail = (followUpId: string, store: StoreAdapter) =>
  renderShell(
    <SignedIn>
      <TaskDetailScreen followUpId={followUpId} />
    </SignedIn>,
    { store },
  );

const audits = (store: StoreAdapter, action: string) =>
  store.getAll<AuditEvent>("auditEvents").then((all) => all.filter((e) => e.action === action));

const opened = () => screen.findByTestId("task-detail-screen", {}, { timeout: 5000 });

beforeEach(() => {
  routerLog.length = 0;
  searchParams.current = {};
});

describe("TaskDetailScreen (HWM-07)", () => {
  it("own overdue task: header, patient reading with units, referral, actions; one followup.viewed", async () => {
    const store = await seededStore();
    const followUp = await mine(store, (f) => f.dueAt === "2026-10-09T06:00:00.000Z");
    const patient = (await store.get<Patient>("patients", followUp.patientId))!;
    await renderDetail(followUp.id, store);
    await opened();

    expect(screen.getByTestId("task-patient-name").textContent).toBe(patient.displayName);
    expect(screen.getByTestId("task-type").textContent).toBe("Check referral attendance");
    expect(screen.getByTestId("task-status-pill").textContent).toBe("Assigned");
    expect(screen.getByTestId("task-overdue-pill").textContent).toBe("Overdue · 5 days");
    expect(screen.getByTestId("task-overdue-caption").textContent).toContain(
      "not approved clinical timing",
    );
    const header = screen.getByTestId("task-header-card");
    for (const label of ["Due", "Assigned by", "Created"]) {
      expect(within(header).getByText(label)).toBeTruthy();
    }
    expect(screen.getByTestId("task-due").textContent).toBe("9 Oct 2026, 08:00 (5 days ago)");
    expect(screen.getByTestId("task-assigned-by").textContent).not.toBe("");

    expect(screen.getByTestId("task-patient-identifier").textContent).toBe(
      patient.syntheticIdentifier,
    );
    const reading = screen.getByTestId("task-latest-reading");
    expect(within(reading).getAllByTestId("reading-value")[0]!.textContent).toMatch(/ mmHg$/);
    expect(within(reading).getByTestId("task-reading-date").textContent).toMatch(/^Measured /);
    expect(within(reading).getByTestId("task-review-status").textContent).not.toBe("");

    const referral = screen.getByTestId("referral-context-card");
    expect(within(referral).getByText("Set by clinician")).toBeTruthy();
    expect(within(referral).getByTestId("referral-destination").textContent).toBe(
      "Demo District Hospital Beta-1",
    );
    expect(within(referral).getByTestId("referral-due").textContent).toMatch(/2026$/);

    expect(screen.getByTestId("attempt-timeline-empty")).toBeTruthy();
    expect(screen.getByTestId("record-attempt").textContent).toBe("Record contact attempt");
    fireEvent.click(screen.getByTestId("record-attempt"));
    fireEvent.click(screen.getByTestId("record-outcome"));
    fireEvent.click(screen.getByTestId("task-open-patient"));
    expect(routerLog.map((e) => e.href)).toEqual([
      { pathname: "/tasks/[followUpId]/attempt", params: { followUpId: followUp.id } },
      { pathname: "/tasks/[followUpId]/outcome", params: { followUpId: followUp.id } },
      { pathname: "/patients/[patientId]", params: { patientId: patient.id } },
    ]);

    await waitFor(async () => expect(await audits(store, "followup.viewed")).toHaveLength(1));
    const [viewed] = await audits(store, "followup.viewed");
    expect(viewed).toMatchObject({ entityType: "follow_up", entityId: followUp.id });
    expect(await audits(store, "access.denied")).toHaveLength(0);
  });

  it("timeline: attempts newest first with channel, result, note and sync state", async () => {
    const store = await seededStore();
    const followUp = await mine(store, (f) => f.status === "contacted");
    await store.put("followUps", {
      ...followUp,
      attempts: [
        ...followUp.attempts,
        {
          id: "attempt-later",
          at: "2026-10-13T09:15:00.000Z",
          method: "phone",
          result: "not_reached",
          note: "No answer (demo).",
          durationMinutes: null,
          recordedBy: WORKER,
        },
      ],
    });
    await renderDetail(followUp.id, store);
    await opened();
    const timeline = screen.getByTestId("attempt-timeline");
    const items = [...timeline.children] as HTMLElement[];
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Phone · Not reached");
    expect(items[0]!.textContent).toContain("No answer (demo).");
    expect(items[0]!.textContent).toContain("11:15");
    expect(items[1]!.textContent).toContain("Home visit · Reached");
    expect(within(items[0]!).getByText("Synced")).toBeTruthy();
  });

  it("completed task: outcome with evidence in the timeline, completed summary, no actions", async () => {
    const store = await seededStore();
    const followUp = await mine(store, (f) => f.status === "completed");
    await renderDetail(followUp.id, store);
    await opened();
    expect(screen.getByTestId("task-status-pill").textContent).toBe("Completed");
    expect(screen.queryByTestId("task-overdue-pill")).toBeNull();
    const items = [...screen.getByTestId("attempt-timeline").children] as HTMLElement[];
    expect(items[0]!.textContent).toContain("Outcome: Attended");
    expect(items[0]!.textContent).toContain("Evidence: Appointment card seen");
    expect(screen.getByTestId("task-completed-summary").textContent).toMatch(/^Completed /);
    expect(screen.queryByTestId("record-attempt")).toBeNull();
    expect(screen.queryByTestId("record-outcome")).toBeNull();
  });

  it("another worker's task: denied + access.denied, no patient data rendered (T-02)", async () => {
    const store = await seededStore();
    const other = (await store.getAll<FollowUp>("followUps")).find(
      (f) => f.assignedWorkerId !== WORKER,
    )!;
    const patient = (await store.get<Patient>("patients", other.patientId))!;
    const view = await renderDetail(other.id, store);
    await waitFor(() =>
      expect(routerLog).toContainEqual({
        method: "replace",
        href: { pathname: "/denied", params: { reason: "task" } },
      }),
    );
    expect(screen.queryByTestId("task-detail-screen")).toBeNull();
    expect(view.container.textContent).not.toContain(patient.displayName);
    expect(view.container.textContent).not.toContain(patient.syntheticIdentifier);

    const denied = await audits(store, "access.denied");
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({
      entityType: "follow_up",
      entityId: other.id,
      outcome: "denied",
    });
    expect(await audits(store, "followup.viewed")).toHaveLength(0);
  });

  it("/denied?reason=task shows the task copy", async () => {
    searchParams.current = { reason: "task" };
    await renderShell(
      <SignedIn>
        <DeniedRoute />
      </SignedIn>,
      { readyTestId: "denied-screen" },
    );
    expect(screen.getByText("This task is not available")).toBeTruthy();
  });
});

describe("relative due dates (HWM-07 §8)", () => {
  const tx = (key: string, values?: Record<string, unknown>) =>
    `${key}${values === undefined ? "" : `:${JSON.stringify(values)}`}`;

  it("uses Intl.RelativeTimeFormat when the runtime has the locale's data", () => {
    expect(formatRelativeDays(-5, "en", tx)).toBe("5 days ago");
    expect(formatRelativeDays(3, "en", tx)).toBe("in 3 days");
    expect(formatRelativeDays(0, "en", tx)).toBe("worker:tasks.relative.today");
  });

  it("falls back to the catalogue when Intl lacks Kinyarwanda (or RelativeTimeFormat)", () => {
    class NoRw {
      static supportedLocalesOf(locales: string[]) {
        return locales.filter((l) => l.startsWith("en"));
      }
      format(): string {
        return "unused";
      }
    }
    const rtf = NoRw as unknown as typeof Intl.RelativeTimeFormat;
    expect(intlRelativeLocale("rw", rtf)).toBeNull();
    expect(formatRelativeDays(-2, "rw", tx, rtf)).toBe('worker:tasks.relative.daysAgo:{"count":2}');
    expect(formatRelativeDays(1, "rw", tx, rtf)).toBe('worker:tasks.relative.inDays:{"count":1}');
    expect(formatRelativeDays(-2, "en", tx, null)).toBe(
      'worker:tasks.relative.daysAgo:{"count":2}',
    );
  });

  it("treats root-only ICU data for rw ('-2 d') as missing", () => {
    // Node's ICU "supports" rw but only has root patterns: never shown to users.
    expect(intlRelativeLocale("rw")).toBeNull();
  });

  it("RW detail renders the catalogue relative date", async () => {
    const store = await seededStore();
    const followUp = await mine(store, (f) => f.dueAt === "2026-10-09T06:00:00.000Z");
    await renderDetail(followUp.id, store);
    await opened();
    fireEvent.click(
      within(screen.getByTestId("language-switcher")).getByRole("radio", { name: "Ikinyarwanda" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("task-due").textContent).toBe(
        "9 Ukw 2026, 08:00 (hashize iminsi 5)",
      ),
    );
    expect(screen.getByTestId("record-attempt").textContent).toBe("Andika igerageza ryo guhura");
    expect(screen.getByText("Byashyizweho na muganga")).toBeTruthy();
  });
});
