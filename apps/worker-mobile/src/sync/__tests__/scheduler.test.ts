/**
 * HWM-09 task 1: the FND-07 backoff curve (2 s ×2, cap 60 s, ±20 % seeded jitter, 8 automatic
 * attempts) as the worker sees it — "Retrying in Ns" / due / "Retry now" — and the earliest due
 * retry for the foreground timer. Ops are never removed or downgraded by failures.
 */
import { createTestRepository } from "@laif/test-utils";
import { PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import {
  backoffMs,
  nextRetryDelayMs,
  retryView,
  SYNC_BACKOFF_MAX_MS,
  SYNC_MAX_AUTO_ATTEMPTS,
} from "../scheduler.ts";

const failed = (attempts: number, nextAttemptAt: string | null) =>
  ({ status: "retryable_failure", attempts, nextAttemptAt }) as const;
const NOW = Date.parse("2026-10-14T06:00:00.000Z");

describe("backoff (FND-07, displayed by HWM-09)", () => {
  it("doubles from 2 s, caps at 60 s, jitter ±20 % and deterministic per op + attempt", () => {
    const bases = [2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000];
    bases.forEach((base, index) => {
      const value = backoffMs(index + 1, "op-a");
      expect(value).toBeGreaterThanOrEqual(base * 0.8);
      expect(value).toBeLessThanOrEqual(base * 1.2);
      expect(backoffMs(index + 1, "op-a")).toBe(value);
    });
    expect(backoffMs(20, "op-a")).toBeLessThanOrEqual(SYNC_BACKOFF_MAX_MS * 1.2);
    expect(backoffMs(3, "op-a")).not.toBe(backoffMs(3, "op-b"));
  });

  it("retryView: scheduled seconds (rounded up), due, manual after 8 attempts, none otherwise", () => {
    expect(retryView(failed(1, "2026-10-14T06:00:07.200Z"), NOW)).toEqual({
      kind: "scheduled",
      seconds: 8,
    });
    expect(retryView(failed(2, "2026-10-14T05:59:59.000Z"), NOW)).toEqual({ kind: "due" });
    expect(retryView(failed(SYNC_MAX_AUTO_ATTEMPTS, null), NOW)).toEqual({ kind: "manual" });
    expect(retryView({ status: "queued", attempts: 0, nextAttemptAt: null }, NOW)).toEqual({
      kind: "none",
    });
  });

  it("nextRetryDelayMs: earliest automatic retry; exhausted / non-failed ops ignored", () => {
    expect(
      nextRetryDelayMs(
        [
          failed(1, "2026-10-14T06:00:10.000Z"),
          failed(3, "2026-10-14T06:00:04.000Z"),
          failed(SYNC_MAX_AUTO_ATTEMPTS, "2026-10-14T06:00:01.000Z"),
          { status: "queued", attempts: 0, nextAttemptAt: null },
        ],
        NOW,
      ),
    ).toBe(4_000);
    expect(nextRetryDelayMs([failed(1, "2026-10-14T05:00:00.000Z")], NOW)).toBe(0);
    expect(nextRetryDelayMs([], NOW)).toBeNull();
  });

  it("100 % failures: growing nextAttemptAt, never removed, auto-retry stops at 8, then sync after clearing", async () => {
    const { repo, clock } = await createTestRepository({
      appId: "worker",
      persona: PERSONA_IDS.chwAlpha1A,
    });
    const patient = (await repo.listPatients({ pageSize: 1 })).items[0]!;
    await repo.createScreening(
      {
        patientId: patient.id,
        measuredAt: "2026-10-14T05:10:00.000Z",
        systolic: 128,
        diastolic: 82,
      },
      "00000000-0000-4000-8000-0000000000c1",
    );
    await repo.demo.setFaults({ serverErrorRate: 1, latencyMs: [0, 0] });
    const delays: number[] = [];
    for (let i = 0; i < SYNC_MAX_AUTO_ATTEMPTS + 2; i += 1) {
      await repo.sync.process({ trigger: "interval" });
      const [op] = await repo.sync.list();
      expect(op?.status).toBe("retryable_failure");
      if (op!.attempts <= 6 && i < 6)
        delays.push(Date.parse(op!.nextAttemptAt!) - clock.now().getTime());
      clock.advanceBy(SYNC_BACKOFF_MAX_MS * 2);
    }
    for (let i = 1; i < delays.length; i += 1) expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
    const [stuck] = await repo.sync.list();
    expect(stuck?.attempts).toBe(SYNC_MAX_AUTO_ATTEMPTS);
    expect(retryView(stuck!, clock.now().getTime())).toEqual({ kind: "manual" });

    await repo.demo.setFaults({ serverErrorRate: 0 });
    expect((await repo.sync.process({ trigger: "interval" })).attempted).toBe(0);
    await repo.sync.retryNow(stuck!.id);
    expect((await repo.sync.process({ trigger: "manual" })).acknowledged).toBe(1);
    expect(await repo.sync.list()).toHaveLength(1);
  });
});
