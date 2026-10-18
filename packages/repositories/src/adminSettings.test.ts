/**
 * ADM-09 admin settings: baseline k = 5, versioned threshold change (before/after audit with
 * justification), `settings.privacy` only (denial audited `admin.settings.denied`), governance
 * floor, idempotency, conflict (stale version and demo `conflictOnce`) and reset to baseline.
 */
import type { AuditEvent } from "@laif/domain";
import { PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { RepositoryError } from "./errors.ts";
import { createHarness, type Harness } from "./testing/harness.ts";

const JUSTIFICATION = "Stricter threshold for the pilot review (demo).";
const events = async (h: Harness, action: string) =>
  (await h.store.getAll<AuditEvent>("auditEvents")).filter((e) => e.action === action);
const lead = () => createHarness({ appId: "admin", personaId: PERSONA_IDS.leadProgramme });

async function rejection(promise: Promise<unknown>): Promise<RepositoryError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RepositoryError) return error;
    throw error;
  }
  throw new Error("expected a rejection");
}

describe("admin settings (ADM-09)", () => {
  it("the baseline is k = 5, version 1, readable by every admin role", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.analystAlpha });
    expect(await h.repo.getAdminSettings()).toMatchObject({
      id: "admin-settings",
      suppressionThreshold: 5,
      updatedBy: null,
      version: 1,
    });
  });

  it("programme lead: 5 → 10 bumps the version and audits before/after + justification", async () => {
    const h = await lead();
    const result = await h.repo.updateAdminSettings(
      { expectedVersion: 1, suppressionThreshold: 10, justification: JUSTIFICATION },
      h.key(),
    );
    expect(result.data).toMatchObject({
      suppressionThreshold: 10,
      version: 2,
      updatedBy: PERSONA_IDS.leadProgramme,
    });
    expect((await h.repo.getAdminSettings()).suppressionThreshold).toBe(10);
    const [event] = await events(h, "admin.settings.suppression_threshold_changed");
    expect(event).toMatchObject({
      entityType: "audit_event",
      entityId: "admin-settings",
      category: "change",
      actorId: PERSONA_IDS.leadProgramme,
      justification: JUSTIFICATION,
      changeSummary: { before: 5, after: 10, fromVersion: 1, toVersion: 2 },
    });
  });

  it("idempotent on the key", async () => {
    const h = await lead();
    const key = h.key();
    const input = { expectedVersion: 1, suppressionThreshold: 8, justification: JUSTIFICATION };
    await h.repo.updateAdminSettings(input, key);
    const replay = await h.repo.updateAdminSettings(input, key);
    expect(replay.replayed).toBe(true);
    expect(await events(h, "admin.settings.suppression_threshold_changed")).toHaveLength(1);
  });

  it("a district analyst is denied (`admin.settings.denied`), nothing changes", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.analystAlpha });
    const error = await rejection(
      h.repo.updateAdminSettings(
        { expectedVersion: 1, suppressionThreshold: 10, justification: JUSTIFICATION },
        h.key(),
      ),
    );
    expect(error.code).toBe("FORBIDDEN");
    const [denied] = await events(h, "admin.settings.denied");
    expect(denied).toMatchObject({
      outcome: "denied",
      actorId: PERSONA_IDS.analystAlpha,
      entityId: "admin-settings",
      changeSummary: { permission: "settings.privacy" },
    });
    expect((await h.repo.getAdminSettings()).suppressionThreshold).toBe(5);
  });

  it("never below the governance floor (3) or above 20", async () => {
    const h = await lead();
    for (const value of [2, 21]) {
      const error = await rejection(
        h.repo.updateAdminSettings(
          { expectedVersion: 1, suppressionThreshold: value, justification: JUSTIFICATION },
          h.key(),
        ),
      );
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.fieldErrors?.["suppressionThreshold"]?.key).toBe("numberOutOfRange");
    }
  });

  it("stale version and a simulated conflict → CONFLICT with latest", async () => {
    const h = await lead();
    await h.repo.updateAdminSettings(
      { expectedVersion: 1, suppressionThreshold: 7, justification: JUSTIFICATION },
      h.key(),
    );
    const stale = await rejection(
      h.repo.updateAdminSettings(
        { expectedVersion: 1, suppressionThreshold: 9, justification: JUSTIFICATION },
        h.key(),
      ),
    );
    expect(stale.code).toBe("CONFLICT");
    expect(stale.conflict?.latest).toMatchObject({ suppressionThreshold: 7, version: 2 });

    await h.repo.demo.setFaults({
      conflictOnce: [{ entityType: "audit_event", entityId: "admin-settings" }],
    });
    const forced = await rejection(
      h.repo.updateAdminSettings(
        { expectedVersion: 2, suppressionThreshold: 9, justification: JUSTIFICATION },
        h.key(),
      ),
    );
    expect(forced.code).toBe("CONFLICT");
    expect(await events(h, "conflict.detected")).toHaveLength(2);
  });

  it("resetDemo restores the baseline", async () => {
    const h = await lead();
    await h.repo.updateAdminSettings(
      { expectedVersion: 1, suppressionThreshold: 12, justification: JUSTIFICATION },
      h.key(),
    );
    await h.repo.demo.resetDemo();
    expect(await h.repo.getAdminSettings()).toMatchObject({ suppressionThreshold: 5, version: 1 });
  });
});
