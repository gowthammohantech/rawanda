/**
 * Test seam (CLN-02): the REAL clinical repository (`createAppRepository`: facility-narrowed
 * actor, simulated transport) on a memory store, no latency, with an in-memory demo session.
 */
import { createMemoryStorage } from "@laif/auth-demo";
import {
  createMemoryStoreAdapter,
  type CareRepository,
  type StoreAdapter,
} from "@laif/repositories";

import { createAppRepository } from "../data/repository.ts";
import { createAppSession, type AppSession } from "../session/session-store.ts";

export type TestClinicalRepo = { repo: CareRepository; session: AppSession; store: StoreAdapter };

export async function createTestClinicalRepo(
  signIn?: { personaId: string; facilityId: string },
  store: StoreAdapter = createMemoryStoreAdapter(),
): Promise<TestClinicalRepo> {
  const session = createAppSession(createMemoryStorage());
  if (signIn !== undefined) {
    const result = session.signIn(signIn.personaId, signIn.facilityId);
    if (!result.ok) throw new Error(`test sign-in failed: ${result.reason}`);
  }
  const repo = createAppRepository({ session, store, noLatency: true });
  await repo.demo.ensureSeeded();
  return { repo, session, store };
}
