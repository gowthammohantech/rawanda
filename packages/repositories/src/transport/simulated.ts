/**
 * Simulated transport (tech spec §4 fault simulation, FND-07 task 7). Every wrapped call:
 * 1. `offline` → `OFFLINE` (nothing runs);
 * 2. sleeps the simulated latency;
 * 3. random `INTERNAL` (500) or `DEPENDENCY_UNAVAILABLE` (503) BEFORE the call runs;
 * 4. runs the call;
 * 5. random `TIMEOUT` AFTER it may have committed — models "did it save?"; idempotency makes
 *    the retry with the same key safe.
 *
 * Web apps get the whole repository wrapped (`withSimulatedTransport`); the worker app writes
 * locally without faults and only its sync sends to the simulated remote go through
 * `simulateTransport`. The `demo` and `sync` namespaces are never wrapped (a demo must always be
 * able to switch faults off again).
 *
 * Deviation (decision): the spec signature `withSimulatedTransport(repo, faults, clock)` takes
 * `options` instead of `clock` — latency is real time (`sleep`), never demo-clock time.
 */
import type { CareRepository } from "../care-repository.ts";
import { RepositoryError, toRepositoryError } from "../errors.ts";
import type { FaultInjector } from "./faults.ts";

export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export type SimulatedTransportOptions = {
  sleep?: Sleep;
  /** Awaited before the fault checks (loads the persisted fault config on first call). */
  ready?: () => Promise<void>;
};

export async function simulateTransport<T>(
  faults: FaultInjector,
  sleep: Sleep,
  call: () => Promise<T>,
): Promise<T> {
  if (faults.get().offline) {
    throw new RepositoryError("OFFLINE", { details: { simulated: true } });
  }
  const latency = faults.latency();
  if (latency > 0) await sleep(latency);
  if (faults.get().offline) {
    throw new RepositoryError("OFFLINE", { details: { simulated: true } });
  }
  if (faults.rollServerError()) {
    throw new RepositoryError("INTERNAL", { details: { simulated: true } });
  }
  if (faults.rollDependencyUnavailable()) {
    throw new RepositoryError("DEPENDENCY_UNAVAILABLE", { details: { simulated: true } });
  }
  let result: T;
  try {
    result = await call();
  } catch (error) {
    throw toRepositoryError(error);
  }
  if (faults.rollTimeout()) {
    throw new RepositoryError("TIMEOUT", { details: { simulated: true, committed: true } });
  }
  return result;
}

const UNWRAPPED = new Set(["sync", "demo"]);

/**
 * Wraps every top-level repository method (not `sync` / `demo`) in `simulateTransport`. Generic
 * so the CTZ-01 `CitizenRepository` facade gets the same fault behaviour.
 */
export function withSimulatedTransport<R extends object = CareRepository>(
  repo: R,
  faults: FaultInjector,
  options: SimulatedTransportOptions = {},
): R {
  const sleep = options.sleep ?? realSleep;
  const ready = options.ready ?? (() => Promise.resolve());
  const wrapped: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(repo)) {
    if (UNWRAPPED.has(name) || typeof value !== "function") {
      wrapped[name] = value;
      continue;
    }
    const method = value as (...args: unknown[]) => Promise<unknown>;
    wrapped[name] = async (...args: unknown[]) => {
      await ready();
      return simulateTransport(faults, sleep, () => method.apply(repo, args));
    };
  }
  return wrapped as unknown as R;
}
