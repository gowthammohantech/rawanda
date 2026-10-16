/**
 * `createCareRepository(deps)` — composes the engine, services, sync queue + simulated remote,
 * demo API and simulated transport over one `StoreAdapter`.
 *
 * - Web apps (`sync: false`, default for clinical / admin / citizen): every top-level method is
 *   wrapped by the simulated transport (latency, 500, 503, timeout-after-commit, offline,
 *   `conflictOnce`).
 * - Worker app (`sync: true`, default for `appId: 'worker'`): local writes commit immediately
 *   and enqueue sync ops; only `sync.process()` sends go through the fault-injected transport
 *   to the simulated remote (`remote_*` collections of the same store).
 * - Startup (first call): fault config loaded from meta `demo.faults`, the demo clock offset
 *   re-applied, and `sending` ops reset to `queued` (crash recovery).
 */
import { createSeed, type SeedDataset } from "@laif/mock-data";

import type { CareRepository, RepositoryDeps } from "./care-repository.ts";
import { Engine } from "./core/engine.ts";
import { applyClockOffset, createDemoApi, META_KEYS } from "./services/demo.ts";
import { createDeviceService } from "./services/devices.ts";
import { createServices } from "./services/index.ts";
import { createSimulatedRemote } from "./sync/simulated-remote.ts";
import { createSyncQueue } from "./sync/sync-queue.ts";
import { createFaultInjector, FAULTS_META_KEY } from "./transport/faults.ts";
import { realSleep, withSimulatedTransport } from "./transport/simulated.ts";

export function createCareRepository(deps: RepositoryDeps): CareRepository {
  const faults = deps.faults ?? createFaultInjector(deps.faultSeed);
  const syncEnabled = deps.sync ?? deps.appId === "worker";
  const sleep = deps.sleep ?? realSleep;
  let seedCache: SeedDataset | null = null;
  const seed = (): SeedDataset => {
    seedCache ??= (deps.seed ?? createSeed)();
    return structuredClone(seedCache);
  };

  let recover: ((tx: RepositoryDeps["store"]) => Promise<void>) | null = null;
  const engine = new Engine({
    deps,
    store: deps.store,
    mode: syncEnabled ? "local-sync" : "direct",
    faults,
    init: () =>
      deps.store.transaction(async (tx) => {
        faults.load(await tx.getMeta(FAULTS_META_KEY));
        applyClockOffset(
          deps.clock as Parameters<typeof applyClockOffset>[0],
          Number((await tx.getMeta(META_KEYS.clockOffsetMs)) ?? "0") || 0,
        );
        if (recover) await recover(tx);
      }),
  });

  const remote = syncEnabled ? createSimulatedRemote(deps.store, { deps, faults }) : null;
  const queue = createSyncQueue({ engine, remote, faults, sleep });
  recover = (tx) => queue.recover(tx);
  if (syncEnabled) engine.enqueue = queue.enqueue;

  const repository: CareRepository = {
    ...createServices(engine),
    sync: queue.api,
    demo: createDemoApi({ engine, remote, faults, seed }),
    device: createDeviceService(engine, { remote: remote !== null }),
  };
  return syncEnabled
    ? repository
    : withSimulatedTransport(repository, faults, { sleep, ready: () => engine.ready() });
}
