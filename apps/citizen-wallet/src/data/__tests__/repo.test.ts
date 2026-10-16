/**
 * CTZ-01 app data layer: the wallet repository runs on the SQLite adapter (the device store's
 * SQL via the Node shim), seeds the citizen slice incl. overlay, and query keys are per persona.
 */
import { createMemoryStorage } from "@laif/auth-demo";
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { RepositoryError } from "@laif/repositories";
import { createSqliteStoreAdapter } from "@laif/repositories/sqlite";
import { createTestSqliteExecutor } from "@laif/test-utils/sqlite";
import { describe, expect, it } from "vitest";

import { createAppSession } from "../../session.ts";
import { createAppRepository } from "../repo.tsx";
import { ctzKeys, shouldRetry } from "../queries.ts";

describe("citizen data layer", () => {
  it("boots on SQLite, seeds the overlay and serves released data for the signed-in persona", async () => {
    const executor = createTestSqliteExecutor();
    const session = createAppSession(createMemoryStorage());
    const repo = createAppRepository({
      session,
      store: createSqliteStoreAdapter(executor),
      noLatency: true,
    });
    expect(await repo.demo.ensureSeeded()).toEqual({ seeded: true });
    expect((await repo.listPersonas()).map((p) => p.citizenCode)).toEqual([
      "CTZ-P1",
      "CTZ-P2",
      "CTZ-P3",
      "CTZ-P4",
      "CTZ-P5",
    ]);
    const patientId = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.patientId;
    expect((await repo.getSession())?.activePatientId).toBe(patientId);
    const steps = await repo.listApprovedInstructions(patientId);
    expect(
      steps.some((s) => s.sourceId === SEED_ANCHORS.CTZ_P1_UNRELEASED_REFERRAL.referralId),
    ).toBe(false);
    const tables = executor.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).toEqual(["meta", "records"]);

    session.switchTo(PERSONA_IDS.citizenWithdrawn);
    const p3 = SEED_ANCHORS.CTZ_P3_WITHDRAWN_PATIENT.patientId;
    await expect(repo.listReleasedObservations(p3)).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "CONSENT_REQUIRED",
    });
  });

  it("query keys are scoped per persona; only transport errors are retried", () => {
    expect(ctzKeys.patient("persona-citizen-1", "p1", "observations")).toEqual([
      "ctz",
      "persona-citizen-1",
      "patient",
      "p1",
      "observations",
    ]);
    expect(ctzKeys.all("a")).not.toEqual(ctzKeys.all("b"));
    expect(shouldRetry(0, new RepositoryError("TIMEOUT"))).toBe(true);
    expect(shouldRetry(1, new RepositoryError("TIMEOUT"))).toBe(false);
    expect(shouldRetry(0, new RepositoryError("FORBIDDEN", { reason: "CONSENT_REQUIRED" }))).toBe(
      false,
    );
  });
});
