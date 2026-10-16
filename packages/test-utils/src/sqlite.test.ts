import { runStoreAdapterContract } from "@laif/repositories/contract-suite";
import { createSqliteStoreAdapter } from "@laif/repositories/sqlite";

import { createTestSqliteExecutor } from "./sqlite.ts";

runStoreAdapterContract("sqlite via @laif/test-utils/sqlite", () =>
  createSqliteStoreAdapter(createTestSqliteExecutor()),
);
