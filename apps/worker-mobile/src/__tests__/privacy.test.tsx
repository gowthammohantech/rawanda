/**
 * HWM-10 privacy hardening:
 * - no outbound network: `fetch` / `XMLHttpRequest` throw if touched while the worker signs in,
 *   saves offline, syncs (in-process simulated transport only), revokes and restores;
 * - no patient identifiers in `console.*` during that flow (plus ESLint `no-console` in `src/`);
 * - audit events (device + simulated server) never carry free-text notes;
 * - every route renders through the kit `Screen` (DemoBanner first, cannot be turned off) —
 *   route-tree test over `app/`;
 * - scoped routes with foreign ids (patient, task, screening of another facility) → `/denied`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AuditEvent } from "@laif/domain";
import { createSeed, FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PatientContextScreen } from "../features/patients/PatientContextScreen.tsx";
import { ScreeningDetailScreen } from "../features/screening/ScreeningDetailScreen.tsx";
import { TaskDetailScreen } from "../features/tasks/TaskDetailScreen.tsx";
import { useSession } from "../session/useSession.ts";
import { routerLog } from "../test/router-stub.tsx";
import { renderShell } from "../test/shell-harness.tsx";

vi.mock("expo-router", () => import("../test/router-stub.tsx"));

// Full shell renders: generous per-test budget when the machine is loaded.
vi.setConfig({ testTimeout: 30_000 });

const T = { timeout: 10_000 };
const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "../..");
const NOTE = "Patient told me something very private";

function SignedIn({ children }: { children?: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(PERSONA_IDS.chwAlpha1A, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  return status === "signed_in" ? <span data-testid="signed-in">{children}</span> : null;
}

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

describe("privacy (HWM-10)", () => {
  const logged: string[] = [];
  beforeEach(() => {
    routerLog.length = 0;
    logged.length = 0;
    for (const method of CONSOLE_METHODS) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(
          args.map((a) => (typeof a === "string" ? a : (JSON.stringify(a) ?? ""))).join(" "),
        );
      });
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("no outbound network, no patient identifiers in logs, no free text in audits", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network access is not allowed in the worker app");
    });
    const xhrSpy = vi.fn(() => {
      throw new Error("network access is not allowed in the worker app");
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", xhrSpy);

    const view = await renderShell(<SignedIn />, { readyTestId: "signed-in" });
    const repo = view.repo();
    const patients = (await repo.listPatients({ pageSize: 200 })).items;
    const patient = patients[0]!;
    await repo.demo.setFaults({ offline: true });
    await repo.createScreening(
      {
        patientId: patient.id,
        measuredAt: "2026-10-14T05:10:00.000Z",
        systolic: 131,
        diastolic: 84,
        notes: NOTE,
      },
      "00000000-0000-4000-8000-0000000f0001",
    );
    const fu = (await repo.listFollowUps({ pageSize: 100 })).items.find(
      (f) => f.assignedWorkerId === PERSONA_IDS.chwAlpha1A && f.status === "assigned",
    )!;
    await repo.updateFollowUp(
      {
        followUpId: fu.id,
        expectedVersion: fu.version,
        action: "record_attempt",
        at: "2026-10-14T05:20:00.000Z",
        method: "phone",
        result: "not_reached",
        note: NOTE,
      },
      "00000000-0000-4000-8000-0000000f0002",
    );
    await repo.demo.setFaults({ offline: false });
    await repo.sync.process({ trigger: "manual" });
    await repo.sync.revokeDevice();
    await repo.sync.restoreDevice();
    await repo.sync.process({ trigger: "manual" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();

    const text = logged.join("\n");
    for (const p of patients) {
      expect(text).not.toContain(p.displayName);
      expect(text).not.toContain(p.syntheticIdentifier);
    }
    expect(text).not.toContain(NOTE);

    const audits = [
      ...(await view.store.getAll<AuditEvent>("auditEvents")),
      ...(await view.store.getAll<AuditEvent>("remote_auditEvents")),
    ];
    expect(audits.some((e) => e.action === "screening.submitted")).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(NOTE);
  });

  it.each([
    [
      "patient",
      (seed: ReturnType<typeof createSeed>) => (
        <PatientContextScreen
          patientId={seed.patients.find((p) => p.facilityId === FACILITY_IDS.beta1)!.id}
        />
      ),
      "patient",
    ],
    [
      "task",
      (seed: ReturnType<typeof createSeed>) => (
        <TaskDetailScreen
          followUpId={seed.followUps.find((f) => f.facilityId === FACILITY_IDS.beta1)!.id}
        />
      ),
      "task",
    ],
    [
      "screening",
      (seed: ReturnType<typeof createSeed>) => (
        <ScreeningDetailScreen
          screeningId={
            seed.screenings.find(
              (s) => s.facilityId === FACILITY_IDS.beta1 && s.status !== "draft",
            )!.id
          }
        />
      ),
      "patient",
    ],
  ])("foreign %s id → /denied, nothing of the record shown", async (_name, ui, reason) => {
    const seed = createSeed();
    const view = await renderShell(<SignedIn>{ui(seed)}</SignedIn>, { readyTestId: "signed-in" });
    if (_name === "screening") {
      // A stray record of another facility on the device (the repository's own scope check is
      // proven elsewhere): the screen still refuses it.
      const foreign = seed.screenings.find(
        (s) => s.facilityId === FACILITY_IDS.beta1 && s.status !== "draft",
      )!;
      await view.store.put("screenings", foreign);
      await view.services.queryClient.invalidateQueries();
    }
    await waitFor(
      () =>
        expect(routerLog).toContainEqual({
          method: "replace",
          href: { pathname: "/denied", params: { reason } },
        }),
      T,
    );
    const foreign = seed.patients.filter((p) => p.facilityId === FACILITY_IDS.beta1);
    const body = document.body.textContent ?? "";
    for (const p of foreign) expect(body).not.toContain(p.displayName);
    expect(screen.queryByTestId("patient-header-card")).toBeNull();
  });
});

describe("route tree (HWM-10): every screen renders under the DemoBanner", () => {
  function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return routeFiles(path);
      return name.endsWith(".tsx") && name !== "_layout.tsx" ? [path] : [];
    });
  }

  /** True when the module (or a feature module it imports) renders the kit `Screen`. */
  function rendersScreen(file: string, seen = new Set<string>()): boolean {
    if (seen.has(file)) return false;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    if (/<Screen[\s>]/u.test(source)) return true;
    const imports = [...source.matchAll(/from "(\.{1,2}\/[^"]+\.tsx)"/gu)].map((m) => m[1]!);
    return imports.some((spec) => rendersScreen(resolve(dirname(file), spec), seen));
  }

  const files = routeFiles(join(APP_ROOT, "app"));

  it("finds the route files", () => {
    expect(files.length).toBeGreaterThanOrEqual(25);
  });

  it.each(files.map((f) => [relative(APP_ROOT, f), f]))("%s → Screen", (_rel, file) => {
    expect(rendersScreen(file)).toBe(true);
  });
});
