/**
 * ADM-09 Reset demo determinism (spec §10): after changes (threshold, faults, data), Reset demo
 * through Settings (type RESET) leaves a Dexie dump (fake-indexeddb) deep-equal to a fresh seed —
 * every collection, every meta key (no `admin.settings`, default faults) — and an audit log of
 * exactly the baseline + one `demo.reset`; the app returns to the sign-in without a session and
 * without the FAULT SIMULATION pill.
 */
import type { AuditEvent } from "@laif/domain";
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { LOCAL_COLLECTIONS } from "@laif/repositories";
import { createDexieStoreAdapter, type DexieStoreAdapter } from "@laif/repositories/dexie";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { bootApp, createTestServices } from "../../test/app.tsx";

type Dump = {
  collections: Record<string, unknown[]>;
  meta: Record<string, string>;
  audit: Array<Pick<AuditEvent, "action" | "entityType" | "entityId" | "actorId" | "outcome">>;
};

async function dump(store: DexieStoreAdapter): Promise<Dump> {
  const collections: Record<string, unknown[]> = {};
  for (const name of LOCAL_COLLECTIONS) {
    if (name === "auditEvents") continue;
    const rows = (await store.db.table(name).toArray()) as Array<{ id: string }>;
    collections[name] = rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  const meta: Record<string, string> = {};
  for (const row of (await store.db.table("meta").toArray()) as Array<{
    key: string;
    value: string;
  }>) {
    // The seeding instant follows the ticking demo clock (asserted separately).
    if (row.key !== "demoClockIso") meta[row.key] = row.value;
  }
  const audit = ((await store.db.table("auditEvents").toArray()) as AuditEvent[])
    .sort((a, b) =>
      a.occurredAt === b.occurredAt ? (a.id < b.id ? -1 : 1) : a.occurredAt < b.occurredAt ? -1 : 1,
    )
    .map(({ action, entityType, entityId, actorId, outcome }) => ({
      action,
      entityType,
      entityId,
      actorId,
      outcome,
    }));
  return { collections, meta, audit };
}

const freshStore = () =>
  createDexieStoreAdapter({ dbName: `laif-admin-reset-${Math.random().toString(36).slice(2)}` });

describe("Reset demo (ADM-09)", () => {
  it("restores a dump deep-equal to a fresh seed, returns to login, clears the fault pill", async () => {
    // Fresh seed.
    const baselineStore = freshStore();
    const baselineServices = await createTestServices(baselineStore);
    await baselineServices.repo.demo.ensureSeeded();
    const baseline = await dump(baselineStore);
    expect(baseline.audit.some((e) => e.action === "demo.reset")).toBe(false);

    // A session that changes things.
    const user = userEvent.setup();
    const store = freshStore();
    const { services, router } = await bootApp({
      store,
      path: "/admin/settings",
      signInAs: PERSONA_IDS.leadProgramme,
      waitFor: "settings-page",
    });
    await services.repo.updateAdminSettings(
      {
        expectedVersion: 1,
        suppressionThreshold: 12,
        justification: "Temporary stricter threshold (demo).",
      },
      crypto.randomUUID(),
    );
    await user.click(await screen.findByRole("checkbox", { name: /^Offline/ }));
    expect(await screen.findByTestId("fault-pill")).toBeTruthy();
    await store.delete("patients", SEED_ANCHORS.WF01_FLAGGED_REVIEW.patientId);
    expect(await dump(store)).not.toEqual(baseline);

    // Reset through Settings: type RESET.
    await user.click(screen.getByRole("button", { name: "Reset demo…" }));
    const confirm = await screen.findByRole("button", { name: "Reset demo" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    await user.type(screen.getByTestId("reset-confirm-input"), "reset");
    expect(confirm.hasAttribute("disabled")).toBe(true);
    await user.clear(screen.getByTestId("reset-confirm-input"));
    await user.type(screen.getByTestId("reset-confirm-input"), "RESET");
    await user.click(confirm);

    expect(await screen.findByText("Demo data restored", {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/login"));
    expect(services.session.getState().session).toBeNull();
    expect(screen.queryByTestId("fault-pill")).toBeNull();

    const after = await dump(store);
    expect(after.collections).toEqual(baseline.collections);
    expect(after.meta).toEqual(baseline.meta);
    expect(after.audit.slice(0, -1)).toEqual(baseline.audit);
    expect(after.audit.at(-1)?.action).toBe("demo.reset");
    expect((await services.repo.demo.getFaults()).offline).toBe(false);
  });
});
