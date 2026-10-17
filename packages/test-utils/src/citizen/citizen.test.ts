import {
  ApprovedInstructionSchema,
  ReleasedObservationSchema,
  PendingReviewPlaceholderSchema,
} from "@laif/contracts";
import { createSqliteStoreAdapter } from "@laif/repositories/sqlite";
import { describe, expect, it } from "vitest";

import { createTestSqliteExecutor } from "../sqlite.ts";
import { aPendingReview, aReleasedObservation, anInstruction, makeCitizenRepo } from "./index.ts";

describe("citizen test utils", () => {
  it("factories produce schema-valid projections", () => {
    expect(ReleasedObservationSchema.safeParse(aReleasedObservation()).success).toBe(true);
    expect(PendingReviewPlaceholderSchema.safeParse(aPendingReview()).success).toBe(true);
    expect(ApprovedInstructionSchema.safeParse(anInstruction()).success).toBe(true);
  });

  it("makeCitizenRepo seeds a memory store and signs in CTZ-P1", async () => {
    const t = await makeCitizenRepo();
    const session = await t.repo.getSession();
    expect(session?.personaId).toBe("persona-citizen-1");
    t.as(null);
    expect(await t.repo.getSession()).toBeNull();
  });

  it("makeCitizenRepo runs on the SQLite shim", async () => {
    const t = await makeCitizenRepo({
      store: createSqliteStoreAdapter(createTestSqliteExecutor()),
    });
    expect((await t.repo.listPersonas()).length).toBe(5);
  });
});
