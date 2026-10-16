import { describe, expect, it } from "vitest";

import * as api from "./index.ts";

describe("@laif/repositories", () => {
  it("exports its package name and the public API", () => {
    expect(api.PACKAGE).toBe("@laif/repositories");
    for (const name of [
      "createCareRepository",
      "createMemoryStoreAdapter",
      "COLLECTIONS",
      "AUDIT_ACTIONS",
      "RepositoryError",
      "withIdempotency",
      "createFaultInjector",
      "withSimulatedTransport",
      "createSyncQueue",
      "createSimulatedRemote",
      "queryKeys",
      "computeDatasetHash",
    ]) {
      expect(api).toHaveProperty(name);
    }
  });
});
