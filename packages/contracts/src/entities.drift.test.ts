/**
 * Type-level proof that `satisfies z.ZodType<Entity>` catches drift (FND-03 acceptance):
 * each `@ts-expect-error` line must fail to compile, otherwise `pnpm typecheck` fails.
 */
import type { CareTask, Patient, Referral } from "@laif/domain";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CareTaskSchema, PatientSchema, ReferralSchema } from "./entities.ts";

type Patients = z.ZodType<Patient>;
type Referrals = z.ZodType<Referral>;
type CareTasks = z.ZodType<CareTask>;

describe("entity schema ↔ domain type drift", () => {
  it("is a compile error when a field type differs or a field is missing", () => {
    const wrongType = PatientSchema.extend({ displayName: z.number() });
    const missingField = PatientSchema.omit({ consentState: true });
    const wrongEnum = ReferralSchema.extend({ status: z.literal("overdue") });
    const wrongPayload = z.object({ kind: z.literal("data_quality"), payload: z.object({}) });

    // @ts-expect-error displayName has the wrong type
    void (wrongType satisfies Patients);
    // @ts-expect-error consentState is missing
    void (missingField satisfies Patients);
    // @ts-expect-error status is not a ReferralStatus
    void (wrongEnum satisfies Referrals);
    // @ts-expect-error CareTask payloads are kind-specific
    void (wrongPayload satisfies CareTasks);

    void (PatientSchema satisfies Patients);
    expect(CareTaskSchema).toBeDefined();
  });
});
