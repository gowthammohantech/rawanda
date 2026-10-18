/**
 * ADM-08 governance writes and reads: versioned grant edits (before/after audit), conflict,
 * the `LAST_ADMIN` lockout rule, idempotency, revoke, validation, the ruleset history, scoped
 * audit visibility, the empty-scope export edge and the append-only audit API.
 */
import { AccessGrantSchema, type AccessGrant, type ExportAudit } from "@laif/contracts";
import type { AuditEvent } from "@laif/domain";
import {
  ADMIN_GRANT_IDS,
  DEMO_RULESET_RETIRED_VERSION,
  DEMO_RULESET_VERSION,
  DISTRICT_IDS,
  FACILITY_IDS,
  PERSONA_IDS,
} from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness, uuid, type Harness } from "./testing/harness.ts";

const JUSTIFICATION = "Narrowed to the facility under supervision review (demo).";

const grantOf = async (h: Harness, id: string): Promise<AccessGrant> => {
  const grant = (await h.repo.listAccessGrants()).find((g) => g.id === id);
  if (!grant) throw new Error(id);
  return grant;
};
const events = async (h: Harness, action: string) =>
  (await h.store.getAll<AuditEvent>("auditEvents")).filter((e) => e.action === action);

const analystEdit = (version: number, extra: Record<string, unknown> = {}) => ({
  id: ADMIN_GRANT_IDS.analystAlpha,
  expectedVersion: version,
  role: "district_analyst" as const,
  districtIds: [DISTRICT_IDS.alpha],
  facilityIds: [FACILITY_IDS.alpha2],
  justification: JUSTIFICATION,
  ...extra,
});

const lead = () => createHarness({ appId: "admin", personaId: PERSONA_IDS.leadProgramme });

describe("updateAccessGrant (ADM-08)", () => {
  it("versioned update: version n → n+1, before/after audit with justification", async () => {
    const h = await lead();
    const result = await h.repo.updateAccessGrant(analystEdit(1), h.key());
    expect(result.replayed).toBe(false);
    expect(result.data).toMatchObject({
      id: ADMIN_GRANT_IDS.analystAlpha,
      version: 2,
      facilityIds: [FACILITY_IDS.alpha2],
      updatedBy: PERSONA_IDS.leadProgramme,
    });
    expect(AccessGrantSchema.parse(await grantOf(h, ADMIN_GRANT_IDS.analystAlpha)).version).toBe(2);
    const [event] = await events(h, "admin.access_grant.changed");
    expect(event).toMatchObject({
      entityType: "access_grant",
      entityId: ADMIN_GRANT_IDS.analystAlpha,
      actorId: PERSONA_IDS.leadProgramme,
      actorRole: "programme_lead",
      category: "change",
      outcome: "success",
      facilityId: null,
      districtId: null,
      justification: JUSTIFICATION,
      changeSummary: {
        personaId: PERSONA_IDS.analystAlpha,
        before: { facilityIds: "ALL_IN_DISTRICTS", role: "district_analyst", validTo: null },
        after: { facilityIds: [FACILITY_IDS.alpha2], role: "district_analyst", validTo: null },
        fromVersion: 1,
        toVersion: 2,
        revoked: false,
      },
    });
  });

  it("idempotent: a replay of the key returns the stored result and writes no second change", async () => {
    const h = await lead();
    const key = h.key();
    const first = await h.repo.updateAccessGrant(analystEdit(1), key);
    const replay = await h.repo.updateAccessGrant(analystEdit(1), key);
    expect(replay.replayed).toBe(true);
    expect(replay.data.version).toBe(first.data.version);
    expect(await events(h, "admin.access_grant.changed")).toHaveLength(1);
    // The same key with a different payload is refused.
    await expect(
      h.repo.updateAccessGrant(analystEdit(1, { facilityIds: [FACILITY_IDS.alpha1] }), key),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("conflict: a stale version → CONFLICT with the latest grant + conflict.detected", async () => {
    const h = await lead();
    await h.repo.updateAccessGrant(analystEdit(1), h.key());
    const error = await h.repo
      .updateAccessGrant(analystEdit(1, { facilityIds: [FACILITY_IDS.alpha1] }), h.key())
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: "CONFLICT",
      conflict: {
        entityType: "access_grant",
        expectedVersion: 1,
        currentVersion: 2,
        latest: { version: 2, facilityIds: [FACILITY_IDS.alpha2] },
        changedBy: PERSONA_IDS.leadProgramme,
      },
    });
    expect(await events(h, "conflict.detected")).toMatchObject([
      { entityType: "access_grant", entityId: ADMIN_GRANT_IDS.analystAlpha },
    ]);
    // A simulated stale version (demo `conflictOnce`) behaves the same.
    await h.repo.demo.setFaults({
      conflictOnce: [{ entityType: "accessGrant", entityId: ADMIN_GRANT_IDS.analystAlpha }],
    });
    await expect(h.repo.updateAccessGrant(analystEdit(2), h.key())).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("LAST_ADMIN: the editor cannot remove roles.configure from their own grant", async () => {
    const h = await lead();
    for (const change of [{ role: "district_analyst" as const }, { revoke: true }]) {
      await expect(
        h.repo.updateAccessGrant(
          {
            id: ADMIN_GRANT_IDS.leadProgramme,
            expectedVersion: 1,
            role: "programme_lead",
            districtIds: [DISTRICT_IDS.alpha, DISTRICT_IDS.beta],
            facilityIds: "ALL_IN_DISTRICTS",
            justification: "Trying to step down as the only demo admin.",
            ...change,
          },
          h.key(),
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "LAST_ADMIN" });
    }
    const denied = (await events(h, "access.denied")).filter(
      (e) => e.entityType === "access_grant",
    );
    expect(denied).toHaveLength(2);
    expect(denied[0]).toMatchObject({
      outcome: "denied",
      entityId: ADMIN_GRANT_IDS.leadProgramme,
      changeSummary: { reason: "LAST_ADMIN", rule: "LAST_ADMIN", ownGrant: true },
    });
    expect((await grantOf(h, ADMIN_GRANT_IDS.leadProgramme)).version).toBe(1);
    expect(await events(h, "admin.access_grant.changed")).toHaveLength(0);
  });

  it("LAST_ADMIN: at least one active roles.configure grant must remain", async () => {
    const h = await lead();
    // Promote the auditor grant, then let the lead's own grant expire (store-level setup).
    await h.repo.updateAccessGrant(
      {
        id: ADMIN_GRANT_IDS.auditorProgramme,
        expectedVersion: 1,
        role: "programme_lead",
        districtIds: [DISTRICT_IDS.alpha, DISTRICT_IDS.beta],
        facilityIds: "ALL_IN_DISTRICTS",
        justification: "Second demo administrator for cover.",
      },
      h.key(),
    );
    const own = await grantOf(h, ADMIN_GRANT_IDS.leadProgramme);
    await h.store.transaction((tx) =>
      tx.put("accessGrants", { ...own, validTo: "2026-01-01T00:00:00.000Z" }),
    );
    await expect(
      h.repo.updateAccessGrant(
        {
          id: ADMIN_GRANT_IDS.auditorProgramme,
          expectedVersion: 2,
          role: "auditor",
          districtIds: [DISTRICT_IDS.alpha, DISTRICT_IDS.beta],
          facilityIds: "ALL_IN_DISTRICTS",
          justification: "Back to read-only governance review.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "LAST_ADMIN" });
  });

  it("only roles.configure may edit (access.denied, entityType access_grant)", async () => {
    for (const personaId of [PERSONA_IDS.analystAlpha, PERSONA_IDS.auditorProgramme]) {
      const h = await createHarness({ appId: "admin", personaId });
      await expect(h.repo.updateAccessGrant(analystEdit(1), h.key())).rejects.toMatchObject({
        code: "FORBIDDEN",
        reason: "ROLE",
      });
      expect(
        (await events(h, "access.denied")).filter((e) => e.entityType === "access_grant"),
      ).toHaveLength(1);
      expect((await grantOf(h, ADMIN_GRANT_IDS.analystAlpha)).version).toBe(1);
    }
  });

  it("validation: non-empty scope, facilities inside the districts, demo roles, justification, validTo", async () => {
    const h = await lead();
    const fields = async (input: Record<string, unknown>) => {
      const error = await h.repo
        .updateAccessGrant(analystEdit(1, input) as never, h.key())
        .catch(
          (e: unknown) => e as { code: string; fieldErrors?: Record<string, { key: string }> },
        );
      expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
      return Object.fromEntries(
        Object.entries((error as { fieldErrors: Record<string, { key: string }> }).fieldErrors).map(
          ([k, v]) => [k, v.key],
        ),
      );
    };
    expect(await fields({ districtIds: [] })).toMatchObject({ districtIds: "required" });
    expect(await fields({ facilityIds: [] })).toMatchObject({ facilityIds: "required" });
    expect(await fields({ facilityIds: [FACILITY_IDS.beta1] })).toEqual({ facilityIds: "invalid" });
    expect(await fields({ districtIds: ["dist-gamma"], facilityIds: "ALL_IN_DISTRICTS" })).toEqual({
      districtIds: "invalid",
    });
    expect(await fields({ role: "clinician" })).toMatchObject({ role: "invalidEnum" });
    expect(await fields({ justification: "short" })).toMatchObject({ justification: "tooShort" });
    expect(await fields({ justification: "x".repeat(301) })).toMatchObject({
      justification: "tooLong",
    });
    expect(await fields({ validTo: "2026-01-01T00:00:00.000Z" })).toMatchObject({
      validTo: "dateMustBeFuture",
    });
    expect((await grantOf(h, ADMIN_GRANT_IDS.analystAlpha)).version).toBe(1);
  });

  it("revoke now: validTo = demo now, admin.access_grant.revoked; the grant is kept", async () => {
    const h = await lead();
    const result = await h.repo.updateAccessGrant(
      analystEdit(1, { facilityIds: "ALL_IN_DISTRICTS", revoke: true }),
      h.key(),
    );
    expect(result.data.validTo).toBe(h.clock.nowIso());
    expect((await h.repo.listAccessGrants()).map((g) => g.id)).toContain(
      ADMIN_GRANT_IDS.analystAlpha,
    );
    expect(await events(h, "admin.access_grant.revoked")).toMatchObject([
      { changeSummary: { revoked: true, after: { validTo: h.clock.nowIso() } } },
    ]);
    // A later edit with an explicit future validTo re-opens it (history is kept).
    const reopened = await h.repo.updateAccessGrant(
      analystEdit(2, { facilityIds: "ALL_IN_DISTRICTS", validTo: "2027-01-01T00:00:00.000Z" }),
      h.key(),
    );
    expect(reopened.data).toMatchObject({ version: 3, validTo: "2027-01-01T00:00:00.000Z" });
  });
});

describe("listRulesets (ADM-08)", () => {
  it("lists the active v1 and the retired v0, newest first, without thresholds", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.auditorProgramme });
    const rows = await h.repo.listRulesets();
    expect(rows.map((r) => [r.version, r.status])).toEqual([
      [DEMO_RULESET_VERSION, "active"],
      [DEMO_RULESET_RETIRED_VERSION, "retired"],
    ]);
    expect(rows[0]).toMatchObject({
      effectiveTo: null,
      label: "DEMO_RULE_NOT_CLINICALLY_VALIDATED",
      approvedBy: null,
      changeSummaryKey: "placeholders_revised",
    });
    expect(rows[1]?.effectiveTo).toBe(rows[0]?.effectiveFrom);
    for (const row of rows) {
      expect(row).not.toHaveProperty("thresholds");
      expect(row.reasonCodes.length).toBeGreaterThan(0);
    }
  });
});

describe("governance reads (ADM-08)", () => {
  it("the scoped analyst sees no District Beta events and no other persona's programme-level events", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.analystAlpha });
    const page = await h.repo.listAuditEvents({ pageSize: 200 });
    const all: AuditEvent[] = [...page.items];
    for (let p = 2; p <= Math.ceil(page.total / 200); p += 1) {
      all.push(...(await h.repo.listAuditEvents({ page: p, pageSize: 200 })).items);
    }
    expect(all.length).toBeGreaterThan(0);
    // The seeded District Beta denial (the analyst's own) is located in Beta → hidden.
    expect(all.some((e) => e.districtId === DISTRICT_IDS.beta)).toBe(false);
    expect(all.some((e) => e.facilityId === FACILITY_IDS.beta1)).toBe(false);
    for (const e of all) {
      if (e.facilityId === null && e.districtId === null) {
        expect(e.actorId).toBe(PERSONA_IDS.analystAlpha);
      }
    }
    // The programme lead (audit.read) sees the seeded Beta event.
    h.as(PERSONA_IDS.leadProgramme);
    const beta = await h.repo.listAuditEvents({ districtIds: [DISTRICT_IDS.beta], pageSize: 200 });
    expect(beta.items.some((e) => e.action === "access.denied")).toBe(true);
  });

  it("an export record with empty district + facility lists is programme-wide (not visible to a district reader)", async () => {
    const h = await lead();
    await h.repo.recordExport(
      {
        reasonCode: "programme_review",
        template: "programme_summary",
        granularity: "scope_total",
        scope: { districtIds: [], facilityIds: [] },
        filters: {},
        period: { from: "2026-07-17", to: "2026-10-14" },
        rowCount: 1,
        suppressedCells: 0,
        sha256: "c".repeat(64),
        exportId: uuid(7001),
      },
      h.key(),
    );
    const ids = (rows: ExportAudit[]) => rows.map((r) => r.id);
    expect(ids(await h.repo.listExportAudits())).toContain(uuid(7001));
    h.as(PERSONA_IDS.auditorProgramme);
    expect(ids(await h.repo.listExportAudits())).toContain(uuid(7001));
    h.as(PERSONA_IDS.analystAlpha);
    expect(ids(await h.repo.listExportAudits())).not.toContain(uuid(7001));
  });

  it("audit is append-only: the repository API exposes no audit update / delete", async () => {
    const h = await lead();
    const names = Object.keys(h.repo).concat(Object.keys(h.repo.demo));
    const auditWriters = names.filter((n) =>
      /^(update|delete|remove|edit|clear|purge|patch|set)[A-Z]?.*audit/i.test(n),
    );
    expect(auditWriters).toEqual([]);
    expect(names).toContain("recordAuditEvent");
    expect(names).toContain("listAuditEvents");
  });
});
