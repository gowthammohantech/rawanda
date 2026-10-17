/**
 * ADM-01 seed sufficiency: every bullet of task 9 is asserted on the admin slice
 * (`sliceForApp(createSeed(), 'admin')` = base + overlay), plus determinism and schema validity.
 */
import {
  AccessGrantSchema,
  ENTITY_SCHEMAS,
  isNormalisedIsoUtc,
  TimeEntrySchema,
  type AccessGrant,
  type TimeEntry,
} from "@laif/contracts";
import {
  isFollowUpOverdue,
  isReferralOverdue,
  type AuditEvent,
  type DemoPersona,
  type Patient,
  type Referral,
  type Review,
  type Screening,
} from "@laif/domain";
import { describe, expect, it } from "vitest";

import { DEMO_RULESET_RETIRED_VERSION, DEMO_RULESET_VERSION } from "../config/demo-ruleset.ts";
import { DISTRICT_IDS } from "../reference/districts.ts";
import { FACILITY_IDS, FACILITY_TO_DISTRICT } from "../reference/facilities.ts";
import { PERSONA_IDS } from "../reference/personas.ts";
import { createSeed } from "../seed/generate.ts";
import { COLLECTION_ENTITY_TYPES, SEED_COLLECTIONS } from "../seed/types.ts";
import { sliceForApp } from "../slices.ts";
import {
  ADMIN_DUPLICATE_IDENTIFIER,
  ADMIN_GRANT_IDS,
  ADMIN_HISTORY_WEEKS,
  ADMIN_OVERLAY_ID_PREFIX,
  buildAdminAnalyticsOverlay,
  kigaliWeekStartMs,
} from "./adminAnalytics.ts";

const DAY = 86_400_000;
const seed = createSeed();
const slice = sliceForApp(seed, "admin");
const now = new Date(seed.meta.demoClockIso);
const nowMs = now.getTime();
const overlay = buildAdminAnalyticsOverlay(seed);

const SUBMITTED = new Set(["submitted", "review_required", "no_review_required"]);
const submitted = slice.screenings.filter((s) => SUBMITTED.has(s.status));
const districtOfFacility = (facilityId: string) => FACILITY_TO_DISTRICT[facilityId];
const extra = <T>(name: string): T[] => (slice.extraCollections[name] ?? []) as T[];

describe("admin analytics overlay (ADM-01 task 9)", () => {
  it("is pinned to the demo clock 2026-10-14T06:00:00.000Z", () => {
    expect(seed.meta.demoClockIso).toBe("2026-10-14T06:00:00.000Z");
  });

  it("is deterministic: two builds are deep-equal (and the admin slice too)", () => {
    expect(buildAdminAnalyticsOverlay(createSeed())).toEqual(overlay);
    expect(sliceForApp(createSeed(), "admin")).toEqual(slice);
  });

  it("adds records on top of the base seed without changing base records", () => {
    for (const name of SEED_COLLECTIONS) {
      const base = seed[name] as unknown[];
      expect((slice[name] as unknown[]).slice(0, base.length)).toEqual(base);
    }
    expect(seed.screenings).toHaveLength(60);
    const overlayIds = (overlay.screenings ?? []).map((s) => (s as Screening).id);
    expect(new Set(overlayIds).size).toBe(overlayIds.length);
    expect(seed.screenings.some((s) => overlayIds.includes(s.id))).toBe(false);
  });

  it("every overlay record parses with its @laif/contracts schema and is synthetic", () => {
    for (const name of SEED_COLLECTIONS) {
      const rows = overlay[name] ?? [];
      const schema = ENTITY_SCHEMAS[COLLECTION_ENTITY_TYPES[name]];
      for (const row of rows) {
        const result = schema.safeParse(row);
        expect(result.success, `${name} ${JSON.stringify(result.error?.issues)}`).toBe(true);
        expect(schema.parse(row)).toEqual(row);
        expect(row).toMatchObject({ synthetic: true });
      }
    }
    for (const g of extra<AccessGrant>("accessGrants"))
      expect(AccessGrantSchema.parse(g)).toEqual(g);
    for (const t of extra<TimeEntry>("timeEntries")) expect(TimeEntrySchema.parse(t)).toEqual(t);
  });

  it("keeps timestamps normalised, within −90 … +14 days, and history in the past", () => {
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
    const visit = (value: unknown): void => {
      if (typeof value === "string" && iso.test(value)) {
        expect(isNormalisedIsoUtc(value), value).toBe(true);
        const days = (Date.parse(value) - nowMs) / DAY;
        expect(days).toBeGreaterThanOrEqual(-90);
        expect(days).toBeLessThanOrEqual(14);
      } else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    // Ruleset effective dates are configuration, not history.
    visit({ ...overlay, rulesets: [] });
    for (const e of overlay.auditEvents as AuditEvent[]) {
      expect(Date.parse(e.occurredAt)).toBeLessThan(nowMs);
    }
  });

  it("uses only overlay ID namespaces (no collision with base IDs)", () => {
    const baseIds = new Set(
      SEED_COLLECTIONS.flatMap((name) =>
        (seed[name] as Array<{ id?: string }>).map((r) => r.id).filter(Boolean),
      ),
    );
    for (const name of SEED_COLLECTIONS) {
      for (const row of (overlay[name] ?? []) as Array<{ id?: string }>) {
        if (row.id !== undefined) expect(baseIds.has(row.id), `${name} ${row.id}`).toBe(false);
      }
    }
    expect(ADMIN_OVERLAY_ID_PREFIX).toBe("admin-overlay:");
  });

  it("2 districts: Alpha with 2 facilities, Beta with 1", () => {
    expect(slice.districts.map((d) => d.id).sort()).toEqual(
      [DISTRICT_IDS.alpha, DISTRICT_IDS.beta].sort(),
    );
    const byDistrict = (d: string) => slice.facilities.filter((f) => f.districtId === d).length;
    expect(byDistrict(DISTRICT_IDS.alpha)).toBe(2);
    expect(byDistrict(DISTRICT_IDS.beta)).toBe(1);
  });

  it("≥150 submitted screenings of all three types across 12 Kigali ISO weeks before DEMO_NOW", () => {
    expect(submitted.length).toBeGreaterThanOrEqual(150);
    const type = (s: Screening) =>
      s.systolic !== null && s.glucoseValue !== null
        ? "both"
        : s.systolic !== null
          ? "bp"
          : s.glucoseValue !== null
            ? "glucose"
            : "none";
    const types = new Set(submitted.map(type));
    expect([...types].sort()).toEqual(["both", "bp", "glucose"]);
    const weekStart = kigaliWeekStartMs(nowMs);
    for (let w = 1; w <= ADMIN_HISTORY_WEEKS; w += 1) {
      const from = weekStart - w * 7 * DAY;
      const inWeek = submitted.filter((s) => {
        const t = Date.parse(s.measuredAt);
        return t >= from && t < from + 7 * DAY;
      });
      expect(inWeek.length, `week −${w}`).toBeGreaterThanOrEqual(5);
    }
    // Kigali Monday: 2026-10-12T00:00+02:00.
    expect(new Date(weekStart).toISOString()).toBe("2026-10-11T22:00:00.000Z");
  });

  it("≥5 dismissed reviews in District Alpha and exactly 1 in District Beta", () => {
    const dismissed = slice.reviews.filter((r) => r.status === "dismissed_with_reason");
    const inDistrict = (d: string) =>
      dismissed.filter((r) => districtOfFacility(r.facilityId) === d).length;
    expect(inDistrict(DISTRICT_IDS.alpha)).toBeGreaterThanOrEqual(5);
    expect(inDistrict(DISTRICT_IDS.beta)).toBe(1);
    for (const r of dismissed) expect((r.decisionReason ?? "").length).toBeGreaterThanOrEqual(10);
  });

  it("designated small cell: Beta-1 has 1–4 completed follow-ups in the default 90-day window; Alpha cells ≥5", () => {
    const from = nowMs - 90 * DAY;
    const completedIn = (facilityId: string) =>
      slice.followUps.filter(
        (f) =>
          f.facilityId === facilityId &&
          f.status === "completed" &&
          f.completedAt !== null &&
          Date.parse(f.completedAt) >= from &&
          Date.parse(f.completedAt) <= nowMs,
      ).length;
    const beta = completedIn(FACILITY_IDS.beta1);
    expect(beta).toBeGreaterThanOrEqual(1);
    expect(beta).toBeLessThanOrEqual(4);
    expect(completedIn(FACILITY_IDS.alpha1)).toBeGreaterThanOrEqual(5);
    expect(completedIn(FACILITY_IDS.alpha2)).toBeGreaterThanOrEqual(5);
  });

  it("≥5 overdue referrals and follow-ups; completed referrals carry evidence; ≥2 unable_to_reach", () => {
    expect(slice.referrals.filter((r) => isReferralOverdue(r, now)).length).toBeGreaterThanOrEqual(
      5,
    );
    expect(slice.followUps.filter((f) => isFollowUpOverdue(f, now)).length).toBeGreaterThanOrEqual(
      5,
    );
    const completed = slice.referrals.filter((r: Referral) => r.status === "completed");
    expect(completed.length).toBeGreaterThan(4);
    for (const r of completed) {
      expect(r.completionEvidence).not.toBeNull();
      expect(r.completedAt).not.toBeNull();
    }
    expect(
      slice.followUps.filter((f) => f.status === "unable_to_reach").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("data-quality fixtures: missing unit ×≥2, duplicate identifier pair, collapsed duplicate, manual escalation, consent withdrawn", () => {
    const missingUnit = submitted.filter((s) => s.glucoseValue !== null && s.glucoseUnit === null);
    expect(missingUnit.length).toBeGreaterThanOrEqual(2);

    const pair = slice.patients.filter(
      (p: Patient) => p.syntheticIdentifier === ADMIN_DUPLICATE_IDENTIFIER,
    );
    expect(pair).toHaveLength(2);
    const [a, b] = pair as [Patient, Patient];
    expect(a.displayName).not.toBe(b.displayName);
    expect(a.duplicateCandidateIds).toEqual([b.id]);
    expect(b.duplicateCandidateIds).toEqual([a.id]);
    expect(pair.every((p) => p.identityStatus === "needs_match_review")).toBe(true);

    const suppressed = slice.auditEvents.filter((e) => e.action === "sync.duplicate_suppressed");
    expect(suppressed).toHaveLength(1);
    const cmid = (suppressed[0]?.changeSummary as { clientMutationId: string }).clientMutationId;
    expect(slice.screenings.filter((s) => s.clientMutationId === cmid)).toHaveLength(1);

    const escalations = slice.reviews.filter((r: Review) => r.origin === "manual_escalation");
    expect(escalations.length).toBeGreaterThanOrEqual(1);
    for (const r of escalations) {
      expect(slice.screenings.find((s) => s.id === r.screeningId)?.status).toBe(
        "no_review_required",
      );
    }

    expect(slice.patients.filter((p) => p.consentState === "withdrawn")).toHaveLength(1);
  });

  it("2 rulesets (v0 retired, v1 active), each with screenings evaluated under it", () => {
    expect(slice.rulesets.map((r) => [r.version, r.status]).sort()).toEqual(
      [
        [DEMO_RULESET_RETIRED_VERSION, "retired"],
        [DEMO_RULESET_VERSION, "active"],
      ].sort(),
    );
    for (const version of [DEMO_RULESET_RETIRED_VERSION, DEMO_RULESET_VERSION]) {
      expect(submitted.filter((s) => s.rulesetVersion === version).length).toBeGreaterThan(0);
    }
  });

  it("4–6 workers with a workerCode, each with self-reported TimeEntry rows", () => {
    const entries = extra<TimeEntry>("timeEntries");
    const workers = new Set(entries.map((t) => t.workerId));
    expect(workers.size).toBeGreaterThanOrEqual(4);
    expect(workers.size).toBeLessThanOrEqual(6);
    for (const id of workers) {
      const persona = slice.personas.find((p: DemoPersona) => p.id === id);
      expect(persona?.role).toBe("community_health_worker");
      expect(persona?.workerCode).toMatch(/^HW-\d{3}$/);
      expect(persona?.facilityIds).toContain(entries.find((t) => t.workerId === id)?.facilityId);
    }
    expect(entries.every((t) => t.source === "self_reported_demo")).toBe(true);
    expect(new Set(entries.map((t) => t.activity)).size).toBe(4);
  });

  it("one AccessGrant per admin persona", () => {
    const grants = extra<AccessGrant>("accessGrants");
    expect(grants.map((g) => g.id).sort()).toEqual(Object.values(ADMIN_GRANT_IDS).sort());
    const byPersona = new Map(grants.map((g) => [g.personaId, g]));
    expect(byPersona.get(PERSONA_IDS.leadProgramme)).toMatchObject({
      districtIds: [DISTRICT_IDS.alpha, DISTRICT_IDS.beta],
      facilityIds: "ALL_IN_DISTRICTS",
    });
    expect(byPersona.get(PERSONA_IDS.analystAlpha)).toMatchObject({
      districtIds: [DISTRICT_IDS.alpha],
      facilityIds: "ALL_IN_DISTRICTS",
    });
    expect(byPersona.get(PERSONA_IDS.fmgrAlpha1)).toMatchObject({
      districtIds: [DISTRICT_IDS.alpha],
      facilityIds: [FACILITY_IDS.alpha1],
    });
    expect(byPersona.get(PERSONA_IDS.auditorProgramme)?.role).toBe("auditor");
  });

  it("≥30 baseline audit events, including one prior export and one prior denied access", () => {
    const events = overlay.auditEvents as AuditEvent[];
    expect(events.length).toBeGreaterThanOrEqual(30);
    const exports = slice.auditEvents.filter((e) => e.action === "export.generated");
    expect(exports).toHaveLength(1);
    expect(exports[0]).toMatchObject({ category: "export", actorId: PERSONA_IDS.analystAlpha });
    const denied = slice.auditEvents.filter((e) => e.action === "access.denied");
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ outcome: "denied", category: "access" });
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it("follow-ups never point at missing reviews/referrals", () => {
    const reviews = new Set(slice.reviews.map((r) => r.id));
    const referrals = new Set(slice.referrals.map((r) => r.id));
    for (const f of slice.followUps) {
      if (f.reviewId !== null) expect(reviews.has(f.reviewId)).toBe(true);
      if (f.referralId !== null) expect(referrals.has(f.referralId)).toBe(true);
    }
  });
});
