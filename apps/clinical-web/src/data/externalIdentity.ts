/**
 * Simulated national-identity adapter (CLN-03 task 9, FRD T-07). The demo is NOT connected to
 * any national identity service: every lookup rejects with `DEPENDENCY_UNAVAILABLE`. It never
 * fabricates an identity and never writes anything (no repository call, no audit event).
 */
import { RepositoryError } from "@laif/repositories";

export type ExternalIdentityLookup = { syntheticIdentifier: string };

export type ExternalIdentityAdapter = {
  lookup(input: ExternalIdentityLookup): Promise<never>;
};

export const NATIONAL_IDENTITY_DEPENDENCY = "national_identity_service" as const;

export const simulatedNationalIdentityAdapter: ExternalIdentityAdapter = {
  lookup() {
    return Promise.reject(
      new RepositoryError("DEPENDENCY_UNAVAILABLE", {
        details: { dependency: NATIONAL_IDENTITY_DEPENDENCY, connected: false },
      }),
    );
  },
};
