import { createDemoClock } from "@laif/domain";
import { createSeed, FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { STAFF_TIME_PROXY_LABEL, workerWorkload } from "./workload.ts";

const seed = createSeed();
const now = createDemoClock().now();

describe("workerWorkload", () => {
  const w = workerWorkload(seed, {}, now);

  it("is labelled as a staff-time proxy (demo)", () => {
    expect(w.label).toBe(STAFF_TIME_PROXY_LABEL);
    expect(w.label).toBe("staff-time proxy (demo)");
    expect(w.labelKey).toBe("admin:metric.staffTimeProxyNote");
  });

  it("keys rows by worker persona id, sorted, without names", () => {
    const ids = w.rows.map((r) => r.workerId);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain(PERSONA_IDS.chwAlpha1A);
    const names = seed.personas.map((p) => p.displayName);
    const json = JSON.stringify(w);
    for (const name of names) expect(json).not.toContain(name);
  });

  it("totals equal naive sums over the seed", () => {
    expect(w.totals.followUpsAssigned).toBe(
      seed.followUps.filter((f) => f.assignedWorkerId !== null).length,
    );
    expect(w.totals.followUpsCompleted).toBe(6);
    const minutes = seed.followUps
      .flatMap((f) => f.attempts)
      .reduce((n, a) => n + (a.durationMinutes ?? 0), 0);
    expect(w.totals.contactMinutes).toBe(minutes);
    expect(w.totals.screeningsRecorded).toBe(57);
    const seconds = seed.screenings
      .filter((s) => s.status !== "draft")
      .reduce((n, s) => n + (s.captureDurationSeconds ?? 0), 0);
    expect(w.totals.screeningCaptureSeconds).toBe(seconds);
    expect(w.totals.staffTimeMinutes).toBeCloseTo(minutes + seconds / 60, 1);
  });

  it("per-worker counts for one CHW", () => {
    const row = w.rows.find((r) => r.workerId === PERSONA_IDS.chwAlpha1A)!;
    const mine = seed.followUps.filter((f) => f.assignedWorkerId === PERSONA_IDS.chwAlpha1A);
    expect(row.followUpsAssigned).toBe(mine.length);
    expect(row.followUpsCompleted).toBe(mine.filter((f) => f.status === "completed").length);
    expect(row.staffTimeMinutes).toBe(
      Math.round((row.contactMinutes + row.screeningCaptureSeconds / 60) * 10) / 10,
    );
  });

  it("respects the facility filter", () => {
    const beta = workerWorkload(seed, { facilityIds: [FACILITY_IDS.beta1] }, now);
    expect(beta.rows.map((r) => r.workerId)).not.toContain(PERSONA_IDS.chwAlpha1A);
    expect(beta.totals.screeningsRecorded).toBe(17);
  });
});
