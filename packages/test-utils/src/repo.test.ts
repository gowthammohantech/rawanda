import type { SyncOperation } from "@laif/domain";
import { PERSONA_IDS, SEED_VERSION } from "@laif/mock-data";
import { createSqliteStoreAdapter } from "@laif/repositories/sqlite";
import { describe, expect, it } from "vitest";

import { createTestClock, DEMO_CLOCK_DEFAULT_ISO } from "./clock.ts";
import { createTestI18n, PACKAGE } from "./index.ts";
import { expectRepositoryError } from "./matchers.ts";
import { createTestRepository } from "./repo.ts";
import { createTestSqliteExecutor } from "./sqlite.ts";
import { readStoreCollection } from "./store.ts";

describe("@laif/test-utils", () => {
  it("exports its package name", () => {
    expect(PACKAGE).toBe("@laif/test-utils");
  });

  it("createTestClock is pinned and advanceable", () => {
    const clock = createTestClock();
    expect(clock.nowIso()).toBe(DEMO_CLOCK_DEFAULT_ISO);
    clock.advanceBy(60_000);
    expect(clock.nowIso()).toBe("2026-10-14T06:01:00.000Z");
    expect(createTestClock("2026-01-01T00:00:00.000Z").nowIso()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("re-exports createTestI18n", () => {
    expect(createTestI18n("rw").language).toBe("rw");
  });
});

describe("createTestRepository", () => {
  it("is seeded, signed in as the app default persona and has no simulated latency", async () => {
    const t = await createTestRepository();
    expect(t.appId).toBe("clinical");
    expect(t.state?.seedVersion).toBe(SEED_VERSION);
    expect(t.actor()?.personaId).toBe(PERSONA_IDS.clinAlpha1);
    expect(t.clock.nowIso()).toBe(DEMO_CLOCK_DEFAULT_ISO);
    const started = performance.now();
    for (let i = 0; i < 10; i += 1) await t.repo.listReviews({});
    expect(performance.now() - started).toBeLessThan(1_000); // 10 × ≥150 ms with real latency
    t.advance(3_600_000);
    expect(t.clock.nowIso()).toBe("2026-10-14T07:00:00.000Z");
  });

  it("SCN-09-version-conflict: a queued op whose processing ends in needs_resolution", async () => {
    const t = await createTestRepository({ scenario: "SCN-09-version-conflict" });
    expect(t.appId).toBe("worker");
    expect(t.actor()?.personaId).toBe(PERSONA_IDS.chwAlpha1A);
    const queued = await readStoreCollection<SyncOperation>(t.store, "syncOperations");
    expect(queued.map((o) => o.status)).toEqual(["queued"]);
    const run = await t.repo.sync.process();
    expect(run.conflicts).toBe(1);
    const [op] = await t.repo.sync.list();
    expect(op).toMatchObject({ status: "needs_resolution", lastError: { code: "CONFLICT" } });
  });

  it("applies faults and supports signing out", async () => {
    const t = await createTestRepository({ faults: { offline: true } });
    await expectRepositoryError(t.repo.listReviews({}), "OFFLINE");
    await t.repo.demo.setFaults({ offline: false });
    t.as(null);
    expect(t.actor()).toBeNull();
    await expectRepositoryError(t.repo.listReviews({}), "FORBIDDEN");
    expect(() => t.as("persona-nope")).toThrow(/unknown persona/);
  });

  it("runs on the SQLite shim (@laif/test-utils/sqlite)", async () => {
    const executor = createTestSqliteExecutor();
    const t = await createTestRepository({
      appId: "worker",
      store: createSqliteStoreAdapter(executor),
    });
    expect((await readStoreCollection(t.store, "patients")).length).toBeGreaterThan(0);
    const rows = executor.db.prepare("SELECT COUNT(*) AS n FROM records").get() as { n: number };
    expect(rows.n).toBeGreaterThan(0);
  });
});

describe("expectRepositoryError", () => {
  it("returns the error and checks code + reason", async () => {
    const t = await createTestRepository({ persona: PERSONA_IDS.clinBeta1 });
    const error = await expectRepositoryError(
      t.repo.startReview({ reviewId: "missing-review", expectedVersion: 1 }, t.key()),
      "NOT_FOUND",
    );
    expect(error.status).toBe(404);
  });

  it("fails when the promise resolves or the code differs", async () => {
    await expect(expectRepositoryError(Promise.resolve(1), "CONFLICT")).rejects.toThrow(
      /promise resolved/,
    );
    await expect(
      expectRepositoryError(Promise.reject(new Error("plain")), "CONFLICT"),
    ).rejects.toThrow();
  });
});
