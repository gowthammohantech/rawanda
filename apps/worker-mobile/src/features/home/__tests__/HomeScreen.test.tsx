/**
 * HWM-03 Today screen: loading → loaded, summary from local records, prioritised rows with
 * text + icon pills, empty state, offline strip, pending count after an enqueue, conflict pill,
 * navigation, and instant EN⇄RW switching (copy and dates).
 */
import type { FollowUp } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { createTestRepository } from "@laif/test-utils";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateAfterWrite } from "../../../data/queryKeys.ts";
import { useSession } from "../../../session/useSession.ts";
import { routerLog } from "../../../test/router-stub.tsx";
import { renderShell } from "../../../test/shell-harness.tsx";
import { HomeScreen, usePullToRefresh } from "../HomeScreen.tsx";
import { SyncStatusStrip } from "../SyncStatusStrip.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const WORKER = PERSONA_IDS.chwAlpha1A;

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(WORKER, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

const renderHome = (store?: StoreAdapter) =>
  renderShell(
    <SignedIn>
      <HomeScreen />
    </SignedIn>,
    { readyTestId: "today-screen", ...(store === undefined ? {} : { store }) },
  );

const loaded = () => screen.findByTestId("worklist-summary", {}, { timeout: 5000 });
const cell = (label: string) =>
  within(screen.getByTestId("worklist-summary")).getByLabelText(new RegExp(`^${label}, `));

beforeEach(() => {
  routerLog.length = 0;
});

describe("HomeScreen (HWM-03)", () => {
  it("loading skeletons → loaded summary, prioritised follow-ups, drafts and caveat", async () => {
    await renderHome();
    // First paint after sign-in: skeleton cards, never a spinner-only screen.
    expect(screen.getAllByTestId("loading-state").length).toBeGreaterThan(0);
    expect(screen.getByTestId("start-screening")).toBeTruthy();
    await loaded();
    expect(screen.queryByTestId("loading-state")).toBeNull();

    expect(screen.getByTestId("home-date").textContent).toBe("WEDNESDAY, 14 OCTOBER");
    expect(screen.getByText(/^Good morning, /)).toBeTruthy();
    expect(screen.getByTestId("home-facility").textContent).not.toBe("");

    expect(cell("Overdue").getAttribute("aria-label")).toBe("Overdue, 2");
    expect(cell("Due today").getAttribute("aria-label")).toBe("Due today, 0");
    expect(cell("Completed").getAttribute("aria-label")).toBe("Completed, 0");
    expect(screen.getByText("0 of 2 done today")).toBeTruthy();
    expect(
      screen.getByText("Overdue = past the demo due date; timing rules not clinically approved"),
    ).toBeTruthy();

    // Overdue first (oldest due first), then upcoming; pills are text + icon.
    const pills = within(screen.getByTestId("next-follow-ups")).getAllByTestId("due-pill");
    expect(pills.map((p) => p.textContent)).toEqual([
      "Overdue · 5 days",
      "Overdue · 2 days",
      "Upcoming · 17 Oct 2026",
      "Upcoming · 20 Oct 2026",
      "Upcoming · 21 Oct 2026",
    ]);
    for (const pill of pills) expect(pill.querySelector("svg")).not.toBeNull();

    expect(screen.getByTestId("drafts-count").textContent).toBe("1 unfinished screening");
    expect(screen.getByTestId("sync-strip-primary").textContent).toBe(
      "Everything on this device is synced",
    );
    expect(screen.getByTestId("sync-strip-last").textContent).toBe("Not synced yet");
  });

  it("navigates: row → task detail, draft → draft, strip → Sync, Start → Screen", async () => {
    await renderHome();
    await loaded();
    const firstRow = within(screen.getByTestId("next-follow-ups")).getAllByRole("button")[0]!;
    fireEvent.click(firstRow);
    fireEvent.click(within(screen.getByTestId("drafts-preview")).getAllByRole("button")[0]!);
    fireEvent.click(screen.getByTestId("sync-status-strip"));
    fireEvent.click(screen.getByTestId("start-screening"));
    const anyId: unknown = expect.any(String);
    expect(routerLog.map((entry) => entry.href)).toEqual([
      { pathname: "/tasks/[followUpId]", params: { followUpId: anyId } },
      { pathname: "/screenings/draft/[draftId]", params: { draftId: anyId } },
      "/sync",
      "/screen",
    ]);
    expect(firstRow.getAttribute("aria-label")).toMatch(/, Overdue · 5 days$/);
  });

  it("empty: no follow-ups → EmptyState, Start screening still shown", async () => {
    const store = createMemoryStoreAdapter();
    await createTestRepository({ appId: "worker", persona: WORKER, store });
    for (const collection of ["followUps", "remote_followUps"] as const) {
      for (const fu of await store.getAll<FollowUp>(collection)) {
        await store.delete(collection, fu.id);
      }
    }
    await renderHome(store);
    expect(await screen.findByText("No follow-ups assigned for today")).toBeTruthy();
    expect(screen.getByTestId("start-screening")).toBeTruthy();
    expect(cell("Overdue").getAttribute("aria-label")).toBe("Overdue, 0");
    expect(screen.queryByTestId("see-all-tasks")).toBeNull();
  });

  it("offline (simulated): the strip says so and everything stays readable", async () => {
    const store = createMemoryStoreAdapter();
    await createTestRepository({
      appId: "worker",
      persona: WORKER,
      store,
      faults: { offline: true },
    });
    await renderHome(store);
    await loaded();
    await waitFor(() =>
      expect(screen.getByTestId("sync-strip-primary").textContent).toBe(
        "Working offline (simulated) · 0 saved on this device",
      ),
    );
    expect(
      within(screen.getByTestId("sync-status-strip")).getByText("Offline (simulated)"),
    ).toBeTruthy();
    expect(screen.getByTestId("next-follow-ups")).toBeTruthy();
  });

  it("pending count updates after a new sync op is enqueued (write helper invalidation)", async () => {
    const view = await renderHome();
    await loaded();
    const repo = view.repo();
    const patient = (await repo.listPatients({ pageSize: 1 })).items[0]!;
    await act(async () => {
      await repo.createScreening(
        {
          patientId: patient.id,
          measuredAt: "2026-10-14T05:10:00.000Z",
          systolic: 128,
          diastolic: 82,
        },
        "00000000-0000-4000-8000-0000000000c1",
      );
      await invalidateAfterWrite(view.services.queryClient);
    });
    await waitFor(() =>
      expect(screen.getByTestId("sync-strip-primary").textContent).toBe("1 waiting to sync"),
    );
  });

  it("pull-to-refresh: online runs one sync pass and re-queries; offline only re-queries", async () => {
    const refresh: { run?: () => Promise<void> } = {};
    function Probe({ offline }: { offline: boolean }) {
      const { onRefresh } = usePullToRefresh(offline);
      useEffect(() => {
        refresh.run = onRefresh;
      }, [onRefresh]);
      return null;
    }
    const enqueue = async (repo: ReturnType<typeof view.repo>, key: string) => {
      const patient = (await repo.listPatients({ pageSize: 1 })).items[0]!;
      await repo.createScreening(
        {
          patientId: patient.id,
          measuredAt: "2026-10-14T05:10:00.000Z",
          systolic: 120,
          diastolic: 80,
        },
        key,
      );
    };
    const view = await renderShell(
      <SignedIn>
        <HomeScreen />
        <Probe offline />
      </SignedIn>,
      { readyTestId: "today-screen" },
    );
    await loaded();
    await act(async () => {
      await enqueue(view.repo(), "00000000-0000-4000-8000-0000000000c2");
      await refresh.run!();
    });
    await waitFor(() =>
      expect(screen.getByTestId("sync-strip-primary").textContent).toBe("1 waiting to sync"),
    );
    expect((await view.repo().sync.getStatus()).pending).toBe(1);
    view.unmount();

    const online = await renderShell(
      <SignedIn>
        <HomeScreen />
        <Probe offline={false} />
      </SignedIn>,
      { readyTestId: "today-screen", store: view.store },
    );
    await loaded();
    await act(async () => {
      await refresh.run!();
    });
    expect((await online.repo().sync.getStatus()).pending).toBe(0);
    await waitFor(() =>
      expect(screen.getByTestId("sync-strip-primary").textContent).toBe(
        "Everything on this device is synced",
      ),
    );
    expect(screen.getByTestId("sync-strip-last").textContent).toMatch(/^Last synced /);
  });

  it("conflicts → danger pill 'needs your decision' (icon + text)", async () => {
    await renderShell(
      <SyncStatusStrip
        offline={false}
        pendingCount={1}
        conflicts={1}
        lastSyncedAt="2026-10-14T05:30:00.000Z"
        onOpenSync={() => undefined}
      />,
      { readyTestId: "sync-status-strip" },
    );
    const pill = screen.getByTestId("sync-strip-conflicts");
    expect(pill.textContent).toBe("1 needs your decision");
    expect(pill.querySelector("svg")).not.toBeNull();
    expect(screen.getByTestId("sync-strip-last").textContent).toBe(
      "Last synced 14 Oct 2026, 07:30",
    );
  });

  it("switches EN ⇄ RW instantly, including the date and pills", async () => {
    await renderHome();
    await loaded();
    fireEvent.click(
      within(screen.getByTestId("language-switcher")).getByRole("radio", { name: "Ikinyarwanda" }),
    );
    await waitFor(() => expect(screen.getByText(/^Mwaramutse, /)).toBeTruthy());
    expect(screen.getByTestId("home-date").textContent).toBe("KUWA GATATU, 14 UKWAKIRA");
    expect(screen.getByText("Tangira isuzuma rishya")).toBeTruthy();
    expect(screen.getByTestId("drafts-count").textContent).toBe("Isuzuma 1 ritarangiye");
    expect(screen.getAllByTestId("due-pill")[0]!.textContent).toBe("Byarengeje igihe · iminsi 5");
    expect(screen.getAllByTestId("due-pill")[2]!.textContent).toBe("Biri imbere · 17 Ukw 2026");
  });
});
