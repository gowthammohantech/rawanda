// @vitest-environment node
/**
 * HWM-06 amendments (T-06): the original values are never overwritten, `screening.amend` carries
 * `baseVersion = screening.version`, the audit keeps the justification, a reason is required
 * (data layer + form schema), the chain rule after an unsynced submit, and a 409 conflict →
 * "needs decision". Also: no app code writes the `screenings` collection directly.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { effectiveReadings, type AuditEvent, type Patient, type Screening } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createTestRepository, type TestRepository } from "@laif/test-utils";
import { describe, expect, it } from "vitest";

import {
  amendValuesFor,
  createAmendSchema,
  toAmendCall,
} from "../../features/screening/amendSchema.ts";
import { syncOpLabel } from "../opLabel.ts";
import * as drafts from "../drafts.ts";
import * as screenings from "../screenings.ts";

const WORKER = PERSONA_IDS.chwAlpha1A;
const FACILITY = FACILITY_IDS.alpha1;
const scope = { workerId: WORKER, facilityId: FACILITY };
const REASON = "Typing error on the cuff reading";

async function submitted(t: TestRepository): Promise<Screening> {
  const patient = (await t.store.getAll<Patient>("patients")).find(
    (p) => p.facilityId === FACILITY,
  )!;
  const draft = await drafts.create(t.repo, patient.id, t.key());
  await drafts.save(
    t.repo,
    draft,
    {
      systolic: 152,
      diastolic: 96,
      glucoseValue: 6.4,
      glucoseUnit: "mmol/L",
      glucoseContext: "fasting",
    },
    t.key(),
  );
  const outcome = await screenings.submitFromDraft(t.repo, scope, draft.id, t.clock.now());
  if (outcome.status !== "submitted") throw new Error(outcome.status);
  return outcome.screening;
}

const worker = () => createTestRepository({ appId: "worker", persona: WORKER });

describe("screenings.amend (HWM-06, T-06)", () => {
  it("appends an attributable amendment; original values untouched; baseVersion; audit", async () => {
    const t = await worker();
    await t.repo.demo.setFaults({ offline: true });
    const original = await submitted(t);
    const amended = await screenings.amend(
      t.repo,
      original,
      { field: "systolic", after: 142, reason: REASON },
      t.key(),
    );

    const stored = (await t.store.get<Screening>("screenings", original.id))!;
    expect(stored.systolic).toBe(152); // original kept
    expect(stored.diastolic).toBe(96);
    expect(stored.amendments).toHaveLength(1);
    expect(stored.amendments[0]).toMatchObject({
      field: "systolic",
      before: 152,
      after: 142,
      reason: REASON,
      amendedBy: WORKER,
    });
    expect(Number.isNaN(Date.parse(stored.amendments[0]!.amendedAt))).toBe(false);
    expect(amended.version).toBe(original.version + 1);
    expect(effectiveReadings(stored)).toMatchObject({ systolic: 142, amendedFields: ["systolic"] });

    const ops = await t.repo.sync.list({ entityId: original.id });
    const amendOp = ops.find((op) => syncOpLabel(op) === "screening.amend")!;
    expect(amendOp.baseVersion).toBe(original.version);
    expect(amendOp.payload).toMatchObject({ expectedVersion: original.version, reason: REASON });

    const audit = (await t.store.getAll<AuditEvent>("auditEvents")).find(
      (e) => e.action === "screening.amended" && e.entityId === original.id,
    );
    expect(audit?.justification).toBe(REASON);
    expect(audit?.changeSummary).toMatchObject({ field: "systolic", before: 152, after: 142 });

    const view = screenings.screeningSyncView(stored, ops);
    expect(view.amendOps).toHaveLength(1);
  });

  it("without a reason the amendment is blocked (form schema and repository); nothing written", async () => {
    const t = await worker();
    const original = await submitted(t);
    const current = effectiveReadings(original);
    const schema = createAmendSchema({ now: () => t.clock.now(), current });
    const noReason = schema.safeParse({ ...amendValuesFor("systolic", current, ""), value: "140" });
    expect(noReason.success).toBe(false);
    expect(noReason.error?.issues.map((i) => i.path[0])).toEqual(["reason"]);
    expect(
      schema.safeParse({ ...amendValuesFor("systolic", current, "too short"), value: "140" })
        .success,
    ).toBe(false);

    await expect(
      screenings.amend(t.repo, original, { field: "systolic", after: 140, reason: "" }, t.key()),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const stored = (await t.store.get<Screening>("screenings", original.id))!;
    expect(stored.amendments).toEqual([]);
    expect(stored.version).toBe(original.version);

    const ok = schema.safeParse({ ...amendValuesFor("systolic", current, REASON), value: "140" });
    expect(ok.success).toBe(true);
    expect(
      toAmendCall({ ...amendValuesFor("systolic", current, ` ${REASON} `), value: "140" }),
    ).toEqual({
      field: "systolic",
      after: 140,
      reason: REASON,
    });
  });

  it("amend schema: same refinements as the form (unchanged, BP order, unit range, context)", async () => {
    const t = await worker();
    const original = await submitted(t);
    const current = effectiveReadings(original);
    const schema = createAmendSchema({ now: () => t.clock.now(), current });
    const keyOf = (values: Parameters<typeof schema.safeParse>[0]) => {
      const parsed = schema.safeParse(values);
      return parsed.success ? null : parsed.error.issues[0]?.message;
    };
    expect(keyOf({ ...amendValuesFor("systolic", current, REASON) })).toBe("validation:noChanges");
    expect(keyOf({ ...amendValuesFor("diastolic", current, REASON), value: "160" })).toBe(
      "validation:diastolicNotBelowSystolic",
    );
    expect(keyOf({ ...amendValuesFor("glucoseValue", current, REASON), value: "120" })).toMatch(
      /^validation:outOfEntryRange/u,
    );
    expect(keyOf({ ...amendValuesFor("glucoseContext", current, REASON), context: null })).toBe(
      "validation:contextRequired",
    );
    expect(
      keyOf({ ...amendValuesFor("glucoseContext", current, REASON), context: "not_recorded" }),
    ).toBeNull();
  });

  it("amend before the submit is synced: chain rule, both acknowledged, remote has the amendment", async () => {
    const t = await worker();
    await t.repo.demo.setFaults({ offline: true });
    const original = await submitted(t);
    await screenings.amend(
      t.repo,
      original,
      { field: "glucoseContext", after: "non_fasting", reason: REASON },
      t.key(),
    );
    await t.repo.demo.setFaults({ offline: false });
    await t.repo.sync.process({ trigger: "manual" });
    const ops = await t.repo.sync.list({ entityId: original.id });
    expect(ops.map((op) => op.status)).toEqual(["acknowledged", "acknowledged"]);
    const remote = await t.store.get<Screening>("remote_screenings", original.id);
    expect(remote?.amendments.map((a) => a.after)).toEqual(["non_fasting"]);
    expect(remote?.glucoseContext).toBe("fasting");
  });

  it("a stale amendment (remote changed) → needs decision, local correction kept", async () => {
    const t = await worker();
    const original = await submitted(t);
    await t.repo.sync.process({ trigger: "manual" });
    const synced = (await t.repo.getScreening(original.id))!;
    await t.repo.sync.simulateRemoteEdit("screening", original.id, { notes: "edited elsewhere" });
    await screenings.amend(
      t.repo,
      synced,
      { field: "systolic", after: 141, reason: REASON },
      t.key(),
    );
    await t.repo.sync.process({ trigger: "manual" });
    const row = (await t.repo.getScreening(original.id))!;
    const view = screenings.screeningSyncView(row, await t.repo.sync.list({ entityId: row.id }));
    expect(view.needsDecision).toBe(true);
    expect(view.state).toBe("conflict");
    expect(view.attentionOpId).not.toBeNull();
    expect(row.amendments).toHaveLength(1);
  });

  it("no app source writes the screenings collection directly (value columns never updated)", () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/u.test(name) && !path.includes("__tests__")) {
          const text = readFileSync(path, "utf8");
          if (/\.(put|delete)\(\s*["']screenings["']/u.test(text))
            offenders.push(relative(root, path));
        }
      }
    };
    walk(join(root, "src"));
    walk(join(root, "app"));
    expect(offenders).toEqual([]);
  });
});
