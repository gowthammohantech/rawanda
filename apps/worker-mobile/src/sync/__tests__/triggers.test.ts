/**
 * HWM-09 task 2: automatic triggers are debounced (1 s, trailing) and skipped offline; runs
 * are single-flight (taps during a run join it); a trigger during a run re-runs once after it;
 * the retry timer is armed at the earliest due retry.
 */
import type { SyncRun, SyncTrigger } from "@laif/repositories";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSyncTriggers, SYNC_TRIGGER_DEBOUNCE_MS } from "../triggers.ts";

const runOf = (trigger: SyncTrigger, n: number): SyncRun =>
  ({ id: `run-${n}`, trigger }) as unknown as SyncRun;

function setup(options: { offline?: boolean; retryDelay?: number | null } = {}) {
  const calls: SyncTrigger[] = [];
  const pending: (() => void)[] = [];
  let offline = options.offline ?? false;
  let retryDelay = options.retryDelay ?? null;
  const triggers = createSyncTriggers({
    process: (trigger) => {
      calls.push(trigger);
      const run = runOf(trigger, calls.length);
      return new Promise<SyncRun>((resolve) => pending.push(() => resolve(run)));
    },
    isOffline: () => offline,
    nextRetryDelayMs: () => Promise.resolve(retryDelay),
  });
  const finish = async () => {
    pending.shift()?.();
    await vi.advanceTimersByTimeAsync(0);
  };
  return {
    triggers,
    calls,
    finish,
    setOffline: (value: boolean) => (offline = value),
    setRetryDelay: (value: number | null) => (retryDelay = value),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("sync triggers (HWM-09)", () => {
  it("debounces a burst of automatic triggers into one run (1 s trailing)", async () => {
    const { triggers, calls, finish } = setup();
    triggers.request("after_write");
    await vi.advanceTimersByTimeAsync(500);
    triggers.request("foreground");
    triggers.request("online");
    await vi.advanceTimersByTimeAsync(SYNC_TRIGGER_DEBOUNCE_MS - 1);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(["online"]);
    await finish();
    triggers.dispose();
  });

  it("skips automatic triggers while offline", async () => {
    const { triggers, calls } = setup({ offline: true });
    triggers.request("after_write");
    await vi.advanceTimersByTimeAsync(SYNC_TRIGGER_DEBOUNCE_MS * 3);
    expect(calls).toEqual([]);
    triggers.dispose();
  });

  it("single-flight: five quick Sync now taps → one run; four of them joined it", async () => {
    const { triggers, calls, finish } = setup();
    const taps = Array.from({ length: 5 }, () => triggers.runNow("manual"));
    expect(triggers.isRunning()).toBe(true);
    await finish();
    const results = await Promise.all(taps);
    expect(calls).toEqual(["manual"]);
    expect(results.filter((r) => r.joined)).toHaveLength(4);
    expect(new Set(results.map((r) => r.run.id)).size).toBe(1);
    expect(triggers.isRunning()).toBe(false);
    triggers.dispose();
  });

  it("an automatic trigger during a run runs once more right after it", async () => {
    const { triggers, calls, finish } = setup();
    const manual = triggers.runNow("manual");
    triggers.request("after_write");
    triggers.request("after_write");
    await vi.advanceTimersByTimeAsync(SYNC_TRIGGER_DEBOUNCE_MS);
    expect(calls).toEqual(["manual"]);
    await finish();
    await manual;
    expect(calls).toEqual(["manual", "after_write"]);
    await finish();
    expect(calls).toHaveLength(2);
    triggers.dispose();
  });

  it("notifies subscribers when a run starts and ends", async () => {
    const { triggers, finish } = setup();
    const seen: boolean[] = [];
    triggers.subscribe((running) => seen.push(running));
    void triggers.runNow("manual");
    await finish();
    expect(seen).toEqual([true, false]);
    triggers.dispose();
  });

  it("arms a retry timer at the earliest due retry after a run (trigger `interval`)", async () => {
    const { triggers, calls, finish, setRetryDelay } = setup({ retryDelay: 8_000 });
    void triggers.runNow("manual");
    setRetryDelay(8_000);
    await finish();
    setRetryDelay(null);
    await vi.advanceTimersByTimeAsync(7_999);
    expect(calls).toEqual(["manual"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(["manual", "interval"]);
    await finish();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(2);
    triggers.dispose();
  });

  it("dispose cancels pending debounce and retry timers", async () => {
    const { triggers, calls } = setup({ retryDelay: 1_000 });
    triggers.request("after_write");
    await triggers.reschedule();
    triggers.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toEqual([]);
  });
});
