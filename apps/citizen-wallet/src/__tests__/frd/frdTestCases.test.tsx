/**
 * CTZ-09 task 11 — FRD §8 T-01 … T-10, citizen interpretation (one `describe` each). Runs the
 * wallet's own repository (`createAppRepository`, memory store, seeded citizen slice) and, where
 * the requirement is about what the citizen SEES, the real screens. T-08 (export) is an explicit
 * N/A assertion: the wallet has no export route, action or copy.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { createMemoryStorage } from "@laif/auth-demo";
import { hashCanonical } from "@laif/domain";
import { enResources } from "@laif/i18n";
import { CITIZEN_OVERLAY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { createMemoryStoreAdapter, RepositoryError, type StoreAdapter } from "@laif/repositories";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createAppRepository } from "../../data/repo.tsx";
import {
  CORRECTION_MESSAGES,
  correctionErrorsOf,
  correctionSchema,
} from "../../features/privacy/correctionSchema.ts";
import { validateCallback } from "../../features/support/callbackSchema.ts";
import { createAppSession } from "../../session.ts";
import { ROUTE_CASES } from "../../test/routes.tsx";
import { renderRoute } from "../../test/walk.tsx";

vi.mock("expo-router", () => import("../../test/router-stub.tsx"));

const P1 = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.patientId;
const P3 = SEED_ANCHORS.CTZ_P3_WITHDRAWN_PATIENT.patientId;
const P4 = SEED_ANCHORS.CTZ_P4_REPRESENTED_PATIENT.patientId;
const STEP = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId;
const AMENDED = CITIZEN_OVERLAY_IDS.amendedScreening;
const DESCRIPTION = "The time of this check looks wrong to me.";

type AuditRow = {
  action: string;
  correlationId: string;
  actorId: string | null;
  entityId: string;
};

async function setup(personaId: string = PERSONA_IDS.citizen1) {
  const store: StoreAdapter = createMemoryStoreAdapter();
  const session = createAppSession(createMemoryStorage());
  session.switchTo(personaId);
  const repo = createAppRepository({ session, store, noLatency: true });
  await repo.demo.ensureSeeded();
  const audits = async (action: string) =>
    (await store.getAll<AuditRow>("auditEvents")).filter((e) => e.action === action);
  const acksOf = async (instructionId: string) =>
    (await store.getAll<{ instructionId: string }>("nextStepAcks")).filter(
      (a) => a.instructionId === instructionId,
    );
  const amendedTarget = async () =>
    (await repo.listCorrectionTargets(P1)).find((t) => t.targetId === AMENDED)!;
  return {
    repo,
    store,
    session,
    audits,
    acksOf,
    amendedTarget,
    key: () => crypto.randomUUID(),
  };
}

async function rejection(promise: Promise<unknown>): Promise<RepositoryError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RepositoryError);
  return error as RepositoryError;
}

const route = (name: string) => ROUTE_CASES.find((r) => r.route === name)!;

describe("T-01 happy path + audit (consent, acknowledgement, correction)", () => {
  it("each write succeeds once and is audited as the signed-in citizen", async () => {
    const h = await setup(PERSONA_IDS.citizenWithdrawn);
    await h.repo.recordConsent({ patientId: P3, action: "granted" }, h.key());
    expect((await h.repo.getConsent(P3)).state).toBe("granted");
    expect(await h.audits("citizen.consent.granted")).toHaveLength(1);

    h.session.switchTo(PERSONA_IDS.citizen1);
    const ack = await h.repo.acknowledgeInstruction(
      { patientId: P1, instructionId: STEP },
      h.key(),
    );
    expect(ack.data.instructionId).toBe(STEP);
    const ackAudits = await h.audits("citizen.next_step.acknowledged");
    expect(ackAudits).toHaveLength(1);
    expect(ackAudits[0]!.actorId).toBe(PERSONA_IDS.citizen1);

    const before = (await h.audits("correction.requested")).length;
    const target = await h.amendedTarget();
    const created = await h.repo.createCorrectionRequest(
      {
        patientId: P1,
        targetType: "screening",
        targetId: AMENDED,
        description: DESCRIPTION,
        expectedTargetVersion: target.version,
      },
      h.key(),
    );
    expect(created.data.kind).toBe("correction_request");
    const requested = await h.audits("correction.requested");
    expect(requested).toHaveLength(before + 1);
    const mine = (await h.audits("task.created")).filter((e) => e.entityId === created.data.id);
    expect(mine).toHaveLength(1);
    const correlation = mine[0]!.correlationId;
    expect(requested.filter((e) => e.correlationId === correlation)).toHaveLength(1);
  });
});

describe("T-02 representative cross-scope and cross-patient deep links", () => {
  it("CTZ-P4 sees Grace only; CTZ-P1's records are FORBIDDEN (SCOPE) + access.denied", async () => {
    const h = await setup(PERSONA_IDS.citizenRep);
    const session = await h.repo.getSession();
    expect(session?.patients.map((p) => p.patientId)).toEqual([P4]);
    expect((await rejection(h.repo.listReleasedObservations(P1))).reason).toBe("SCOPE");
    expect((await rejection(h.repo.getObservation(AMENDED, P4))).reason).toBe("SCOPE");
    expect((await rejection(h.repo.getInstruction(STEP, P4))).reason).toBe("SCOPE");
    expect((await h.audits("access.denied")).length).toBeGreaterThanOrEqual(3);
  });

  it("deep link to CTZ-P1's result as CTZ-P4 → PermissionDenied, no values rendered", async () => {
    await renderRoute(
      { ...route("(app)/(tabs)/health/[observationId]"), ready: "permission-denied" },
      PERSONA_IDS.citizenRep,
    );
    expect(screen.queryByTestId("result-readings")).toBeNull();
  });
});

describe("T-03 field-level errors (correction, callback)", () => {
  it("each invalid field maps to its own translated message key", () => {
    const parsed = correctionSchema.safeParse({
      targetType: "screening",
      targetId: "",
      description: "short",
      suggestedValue: "",
      understood: false,
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const errors = correctionErrorsOf(parsed.error);
    expect(Object.keys(errors).sort()).toEqual(["description", "targetId", "understood"]);
    for (const key of Object.values(errors)) {
      expect(Object.values(CORRECTION_MESSAGES)).toContain(key);
    }

    const callback = validateCallback({ topic: null, window: null, note: "" });
    expect(callback.ok).toBe(false);
    if (callback.ok) return;
    expect(Object.keys(callback.errors).sort()).toEqual(["topic", "window"]);
  });
});

describe("T-04 double submission", () => {
  it("same key twice → one ack, one prefs change, one correction task, one callback task", async () => {
    const h = await setup();
    const ackKey = h.key();
    await Promise.all([
      h.repo.acknowledgeInstruction({ patientId: P1, instructionId: STEP }, ackKey),
      h.repo.acknowledgeInstruction({ patientId: P1, instructionId: STEP }, ackKey),
    ]);
    expect(await h.acksOf(STEP)).toHaveLength(1);

    const prefs = (await h.repo.getNotificationPrefs(P1))!;
    const prefsKey = h.key();
    const prefsInput = {
      patientId: P1,
      expectedVersion: prefs.version,
      optedIn: false,
      timing: prefs.timing,
    };
    await h.repo.updateNotificationPrefs(prefsInput, prefsKey);
    await h.repo.updateNotificationPrefs(prefsInput, prefsKey);
    expect(await h.audits("reminder.preference_changed")).toHaveLength(1);

    const target = await h.amendedTarget();
    const corrKey = h.key();
    const corrInput = {
      patientId: P1,
      targetType: "screening" as const,
      targetId: AMENDED,
      description: DESCRIPTION,
      expectedTargetVersion: target.version,
    };
    const first = await h.repo.createCorrectionRequest(corrInput, corrKey);
    const second = await h.repo.createCorrectionRequest(corrInput, corrKey);
    expect(second.data.id).toBe(first.data.id);

    const cbKey = h.key();
    const cb = {
      patientId: P1,
      topic: "appointment_question" as const,
      window: "morning" as const,
    };
    const a = await h.repo.createCallbackRequest(cb, cbKey);
    const b = await h.repo.createCallbackRequest(cb, cbKey);
    expect(b.data.id).toBe(a.data.id);
  });
});

describe("T-05 concurrent update → conflict, nothing written", () => {
  it("stale ack / prefs / correction versions are rejected with CONFLICT", async () => {
    const h = await setup();
    await h.repo.demo.setFaults({ conflictOnce: [{ entityType: "patient", entityId: P1 }] });
    const ackError = await rejection(
      h.repo.acknowledgeInstruction({ patientId: P1, instructionId: STEP }, h.key()),
    );
    expect(ackError.code).toBe("CONFLICT");
    expect(await h.acksOf(STEP)).toHaveLength(0);

    const prefs = (await h.repo.getNotificationPrefs(P1))!;
    const prefsError = await rejection(
      h.repo.updateNotificationPrefs(
        {
          patientId: P1,
          expectedVersion: prefs.version + 5,
          optedIn: false,
          timing: prefs.timing,
        },
        h.key(),
      ),
    );
    expect(prefsError.code).toBe("CONFLICT");
    expect(await h.audits("reminder.preference_changed")).toHaveLength(0);

    const target = await h.amendedTarget();
    const before = (await h.audits("correction.requested")).length;
    const corrError = await rejection(
      h.repo.createCorrectionRequest(
        {
          patientId: P1,
          targetType: "screening",
          targetId: AMENDED,
          description: DESCRIPTION,
          expectedTargetVersion: target.version - 1,
        },
        h.key(),
      ),
    );
    expect(corrError.code).toBe("CONFLICT");
    expect(await h.audits("correction.requested")).toHaveLength(before);
  });
});

describe("T-06 correction keeps the original", () => {
  it("a correction request never changes the record (hash); the amended result keeps its original", async () => {
    const h = await setup();
    const screeningHash = async () =>
      hashCanonical(
        (await h.store.getAll<{ id: string }>("screenings")).find((s) => s.id === AMENDED),
      );
    const before = await screeningHash();
    const target = await h.amendedTarget();
    await h.repo.createCorrectionRequest(
      {
        patientId: P1,
        targetType: "screening",
        targetId: AMENDED,
        description: DESCRIPTION,
        expectedTargetVersion: target.version,
      },
      h.key(),
    );
    expect(await screeningHash()).toBe(before);

    const amended = await h.repo.getObservation(AMENDED, P1);
    expect(amended.originalReadings).not.toBeNull();
    expect(amended.amendments.length).toBeGreaterThan(0);
    const timeline = await h.repo.listTimeline(P1);
    expect(timeline.some((i) => i.kind === "record_updated" && i.state === "changed")).toBe(true);
  });
});

describe("T-07 verification service unavailable → no identity fabricated", () => {
  it("DEPENDENCY_UNAVAILABLE: account stays pending, nothing linked, attempt audited", async () => {
    const h = await setup(PERSONA_IDS.citizenPending);
    await h.repo.demo.setFaults({ dependencyUnavailableRate: 1 });
    const error = await rejection(h.repo.verifyIdentity({ code: "246810" }, h.key()));
    expect(error.code).toBe("DEPENDENCY_UNAVAILABLE");
    await h.repo.demo.setFaults({ dependencyUnavailableRate: 0 });
    const session = await h.repo.getSession();
    expect(session?.account?.status).toBe("pending_verification");
    expect(session?.activePatientId).toBeNull();
    expect(await h.audits("citizen.identity.verified")).toHaveLength(0);
    expect(await h.audits("citizen.identity.verification_unavailable")).toHaveLength(1);
  });
});

describe("T-08 export — N/A for the wallet", () => {
  it("no export route, repository method or citizen copy exists", async () => {
    const appDir = join(import.meta.dirname, "../../../app");
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) =>
        statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)],
      );
    for (const file of files(appDir)) {
      expect(file).not.toMatch(/export|download/iu);
      expect(readFileSync(file, "utf8")).not.toMatch(/exportBundle|downloadData/u);
    }
    const h = await setup();
    const methods = [...Object.keys(h.repo), ...Object.keys(h.repo.demo)];
    expect(methods.filter((m) => /export/iu.test(m))).toEqual([]);
    expect(JSON.stringify(enResources.citizen)).not.toMatch(/\bexport\b/iu);
  });
});

describe("T-09 interrupted write → retry with the same key", () => {
  it("error500 then the same key again → exactly one acknowledgement", async () => {
    const h = await setup();
    const key = h.key();
    await h.repo.demo.setFaults({ serverErrorRate: 1 });
    const error = await rejection(
      h.repo.acknowledgeInstruction({ patientId: P1, instructionId: STEP }, key),
    );
    expect(error.retryable).toBe(true);
    await h.repo.demo.setFaults({ serverErrorRate: 0 });
    await h.repo.acknowledgeInstruction({ patientId: P1, instructionId: STEP }, key);
    await h.repo.acknowledgeInstruction({ patientId: P1, instructionId: STEP }, key);
    expect(await h.acksOf(STEP)).toHaveLength(1);
    expect(await h.audits("citizen.next_step.acknowledged")).toHaveLength(1);
  });
});

describe("T-10 flag explanation — citizen variant", () => {
  it("review status + responsible professional shown; ruleset / rule detail never reach the wallet", async () => {
    const h = await setup();
    const list = await h.repo.listReleasedObservations(P1);
    expect(JSON.stringify(list)).not.toMatch(/ruleset|ruleId|reasonCode|flagReason|threshold/iu);
    const reviewed = list.find((o) => o.kind === "released" && o.reviewedBy !== null);
    expect(reviewed).toBeDefined();

    await renderRoute(
      {
        ...route("(app)/(tabs)/health/[observationId]"),
        params: { observationId: reviewed!.id },
      },
      PERSONA_IDS.citizen1,
    );
    expect(screen.getByTestId("review-provenance").textContent ?? "").not.toBe("");
    expect(document.body.textContent ?? "").not.toMatch(/ruleset|rule set|v\d+\.\d+\.\d+/iu);
  });
});
