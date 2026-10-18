/**
 * Sync triggers (HWM-09 task 2) — the phase's `engine.drainOnce(trigger)` is FND-07
 * `repo.sync.process({ trigger })` (single-flight inside the repository as well).
 *
 * - Automatic triggers — app back in the foreground (`foreground`), simulated network
 *   offline → online (`online`), a committed local write (`after_write`), a conflict resolution
 *   (`after_resolution`) — are DEBOUNCED (1 s, trailing): a burst of them is one run. They do
 *   nothing while the simulated network is offline (ops stay queued, safe on the device).
 * - `runNow(trigger)` (Sync now) starts a run immediately; while a run is in flight every
 *   further call JOINS it (`joined: true` — WF-02 step 2, duplicate taps coalesced).
 * - An automatic trigger that fires during a run is remembered and runs once more right after
 *   (a write committed after the run's last pick is not left waiting).
 * - After every run a timer is armed at the earliest due automatic retry (`nextAttemptAt`,
 *   demo clock) while the app is in the foreground (`interval`).
 *
 * React wiring (AppState, network store, session) is in `SyncTriggersProvider.tsx`.
 */
import type { SyncRun, SyncTrigger } from "@laif/repositories";

export const SYNC_TRIGGER_DEBOUNCE_MS = 1_000;
/** The retry timer never fires sooner than this (an already-due op after a failed run). */
export const SYNC_RETRY_TIMER_MIN_MS = 500;

export type AutoSyncTrigger = Extract<
  SyncTrigger,
  "foreground" | "online" | "after_write" | "after_resolution" | "interval"
>;

export type TimerApi = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const defaultTimers: TimerApi = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type SyncTriggerDeps = {
  process: (trigger: SyncTrigger) => Promise<SyncRun>;
  isOffline: () => boolean;
  /** Milliseconds until the earliest automatic retry, null when none (see `scheduler.ts`). */
  nextRetryDelayMs: () => Promise<number | null>;
  /** After every run (success or failure) — e.g. refresh the queries. */
  onSettled?: (run: SyncRun | null) => void;
  debounceMs?: number;
  timers?: TimerApi;
};

export type SyncRunResult = { run: SyncRun; joined: boolean };

export type SyncTriggers = {
  /** Debounced automatic trigger (skipped while offline). */
  request: (trigger: AutoSyncTrigger) => void;
  /** Immediate run; joins the in-flight run instead of starting a second one. */
  runNow: (trigger: SyncTrigger) => Promise<SyncRunResult>;
  isRunning: () => boolean;
  /** Notified when a run starts / ends. */
  subscribe: (listener: (running: boolean) => void) => () => void;
  /** Re-arms the retry timer (after a "Retry now", a fault change, …). */
  reschedule: () => Promise<void>;
  dispose: () => void;
};

export function createSyncTriggers(deps: SyncTriggerDeps): SyncTriggers {
  const timers = deps.timers ?? defaultTimers;
  const debounceMs = deps.debounceMs ?? SYNC_TRIGGER_DEBOUNCE_MS;
  const listeners = new Set<(running: boolean) => void>();
  let inflight: Promise<SyncRun> | null = null;
  let debounceHandle: unknown = null;
  let retryHandle: unknown = null;
  let pending: AutoSyncTrigger | null = null;
  let rerun: AutoSyncTrigger | null = null;
  let disposed = false;

  const notify = (running: boolean) => {
    for (const listener of listeners) listener(running);
  };

  const clearRetry = () => {
    if (retryHandle !== null) timers.clear(retryHandle);
    retryHandle = null;
  };

  async function reschedule(): Promise<void> {
    clearRetry();
    if (disposed || deps.isOffline()) return;
    let delay: number | null;
    try {
      delay = await deps.nextRetryDelayMs();
    } catch {
      return;
    }
    if (delay === null || disposed) return;
    clearRetry();
    retryHandle = timers.set(
      () => {
        retryHandle = null;
        if (!disposed && !deps.isOffline()) void runNow("interval").catch(() => undefined);
      },
      Math.max(SYNC_RETRY_TIMER_MIN_MS, delay),
    );
  }

  function start(trigger: SyncTrigger): Promise<SyncRun> {
    clearRetry();
    notify(true);
    const run = deps.process(trigger);
    inflight = run;
    const settle = (result: SyncRun | null) => {
      inflight = null;
      notify(false);
      deps.onSettled?.(result);
      if (disposed) return;
      const again = rerun;
      rerun = null;
      if (again !== null && !deps.isOffline()) void runNow(again).catch(() => undefined);
      else void reschedule();
    };
    run.then(settle, () => settle(null));
    return run;
  }

  async function runNow(trigger: SyncTrigger): Promise<SyncRunResult> {
    if (inflight !== null) return { run: await inflight, joined: true };
    return { run: await start(trigger), joined: false };
  }

  function fire() {
    debounceHandle = null;
    const trigger = pending;
    pending = null;
    if (trigger === null || disposed || deps.isOffline()) return;
    if (inflight !== null) {
      rerun = trigger;
      return;
    }
    void runNow(trigger).catch(() => undefined);
  }

  return {
    request(trigger) {
      if (disposed) return;
      pending = trigger;
      if (debounceHandle !== null) timers.clear(debounceHandle);
      debounceHandle = timers.set(fire, debounceMs);
    },
    runNow,
    isRunning: () => inflight !== null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reschedule,
    dispose() {
      disposed = true;
      if (debounceHandle !== null) timers.clear(debounceHandle);
      debounceHandle = null;
      clearRetry();
      listeners.clear();
    },
  };
}
