/**
 * HWM-07 Tasks tab: skeleton → Due list, tab counts = list lengths = Today, Overdue / Completed
 * switching (route param), neutral per-filter empty copy, search, NEEDS DECISION pill for a
 * conflicting task, navigation to detail, and EN ⇄ RW labels.
 */
import type { FollowUp, SyncOperation } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { createTestRepository } from "@laif/test-utils";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "../../../session/useSession.ts";
import { routerLog, searchParams } from "../../../test/router-stub.tsx";
import { renderShell } from "../../../test/shell-harness.tsx";
import { TasksScreen } from "../TasksScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const WORKER = PERSONA_IDS.chwAlpha1A;

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(WORKER, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

const renderTasks = (store?: StoreAdapter) =>
  renderShell(
    <SignedIn>
      <TasksScreen />
    </SignedIn>,
    { readyTestId: "tasks-screen", ...(store === undefined ? {} : { store }) },
  );

const tab = (name: RegExp) =>
  within(screen.getByTestId("task-filter-tabs")).getByRole("tab", { name });
const rows = () => within(screen.getByTestId("task-list")).getAllByRole("button");
const loaded = () => screen.findByTestId("task-list", {}, { timeout: 5000 });

beforeEach(() => {
  routerLog.length = 0;
  searchParams.current = {};
});

describe("TasksScreen (HWM-07)", () => {
  it("skeleton → Due tab with counts that equal the list lengths", async () => {
    await renderTasks();
    expect(screen.getAllByTestId("loading-state").length).toBeGreaterThan(0);
    await loaded();
    expect(screen.getByRole("tablist", { name: "Filter tasks" })).toBeTruthy();
    expect(tab(/^Due/).getAttribute("aria-label")).toBe("Due, 3 items");
    expect(tab(/^Overdue/).getAttribute("aria-label")).toBe("Overdue, 2 items");
    expect(tab(/^Completed/).getAttribute("aria-label")).toBe("Completed, 2 items");
    expect(tab(/^Due/).getAttribute("aria-selected")).toBe("true");

    expect(rows()).toHaveLength(3);
    const pills = screen.getAllByTestId("task-due-pill").map((p) => p.textContent);
    expect(pills).toEqual(["Due 17 Oct 2026", "Due 20 Oct 2026", "Due 21 Oct 2026"]);
    expect(screen.getAllByTestId("task-attempts").map((p) => p.textContent)).toEqual([
      "1 attempt",
      "1 attempt",
      "No attempts yet",
    ]);
    for (const pill of screen.getAllByTestId("task-due-pill")) {
      expect(pill.querySelector("svg")).not.toBeNull();
    }
  });

  it("Overdue and Completed tabs: lists, route param, caveat; opens task detail", async () => {
    await renderTasks();
    await loaded();
    fireEvent.click(tab(/^Overdue/));
    await waitFor(() =>
      expect(screen.getAllByTestId("task-due-pill").map((p) => p.textContent)).toEqual([
        "Overdue · 5 days",
        "Overdue · 2 days",
      ]),
    );
    expect(routerLog).toContainEqual({ method: "setParams", href: { filter: "overdue" } });
    expect(screen.getByTestId("tasks-overdue-caveat").textContent).toContain(
      "timing rules not clinically approved",
    );
    expect(rows()).toHaveLength(2);

    fireEvent.click(tab(/^Completed/));
    await waitFor(() =>
      expect(screen.getAllByTestId("task-due-pill").map((p) => p.textContent)).toEqual([
        "Completed 12 Sep 2026",
        "Completed 6 Sep 2026",
      ]),
    );
    fireEvent.click(rows()[0]!);
    const anyId: unknown = expect.any(String);
    expect(routerLog.at(-1)).toEqual({
      method: "push",
      href: { pathname: "/tasks/[followUpId]", params: { followUpId: anyId } },
    });
  });

  it("opens on the route's filter (`/tasks?filter=overdue`)", async () => {
    searchParams.current = { filter: "overdue" };
    await renderTasks();
    await loaded();
    expect(tab(/^Overdue/).getAttribute("aria-selected")).toBe("true");
    expect(rows()).toHaveLength(2);
  });

  it("neutral per-filter empty copy; search narrows and has its own empty state", async () => {
    const store = createMemoryStoreAdapter();
    await createTestRepository({ appId: "worker", persona: WORKER, store });
    for (const fu of await store.getAll<FollowUp>("followUps")) {
      if (fu.status !== "completed") await store.delete("followUps", fu.id);
    }
    await renderTasks(store);
    expect(await screen.findByText("No tasks due", {}, { timeout: 5000 })).toBeTruthy();
    fireEvent.click(tab(/^Overdue/));
    expect(await screen.findByText("No overdue tasks")).toBeTruthy();
    expect(screen.queryByText(/well done/i)).toBeNull();
    fireEvent.click(tab(/^Completed/));
    await waitFor(() => expect(rows()).toHaveLength(2));

    fireEvent.change(screen.getByTestId("task-search-input"), { target: { value: "zzzz" } });
    expect(await screen.findByText("No tasks match “zzzz”")).toBeTruthy();
    // Tab counts stay the tab totals while searching.
    expect(tab(/^Completed/).getAttribute("aria-label")).toBe("Completed, 2 items");
    fireEvent.click(screen.getByTestId("task-search-clear"));
    await waitFor(() => expect(rows()).toHaveLength(2));
  });

  it("a task whose latest change is in conflict shows NEEDS DECISION", async () => {
    const store = createMemoryStoreAdapter();
    const t = await createTestRepository({
      appId: "worker",
      persona: WORKER,
      store,
      faults: { offline: true },
    });
    const target = (await store.getAll<FollowUp>("followUps")).find(
      (f) => f.assignedWorkerId === WORKER && f.status === "contacted",
    )!;
    await t.repo.updateFollowUp(
      {
        followUpId: target.id,
        expectedVersion: target.version,
        action: "add_note",
        note: "Called (demo).",
      },
      t.key(),
    );
    const op = (await store.getAll<SyncOperation>("syncOperations")).find(
      (o) => o.entityId === target.id,
    )!;
    await store.put("syncOperations", { ...op, status: "conflict" });

    await renderTasks(store);
    await loaded();
    const row = screen.getByTestId(`task-row-${target.id}`);
    expect(within(row).getByTestId("task-needs-decision").textContent).toBe("Needs decision");
  });

  it("switches EN ⇄ RW: tabs, pills and attempts translate", async () => {
    await renderTasks();
    await loaded();
    fireEvent.click(
      within(screen.getByTestId("language-switcher")).getByRole("radio", { name: "Ikinyarwanda" }),
    );
    await waitFor(() => expect(tab(/^Ibigomba gukorwa/)).toBeTruthy());
    expect(tab(/^Byarengeje igihe/)).toBeTruthy();
    expect(tab(/^Byarangiye/)).toBeTruthy();
    expect(screen.getAllByTestId("task-attempts")[0]!.textContent).toBe("Igerageza 1");
    fireEvent.click(tab(/^Byarengeje igihe/));
    await waitFor(() =>
      expect(screen.getAllByTestId("task-due-pill")[0]!.textContent).toBe(
        "Byarengeje igihe · iminsi 5",
      ),
    );
  });
});
