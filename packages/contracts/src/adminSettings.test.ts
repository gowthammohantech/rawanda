import { describe, expect, it } from "vitest";

import {
  ADMIN_THRESHOLD_MAX,
  ADMIN_THRESHOLD_MIN,
  AdminSettingsSchema,
  AdminSettingsUpdateInputSchema,
} from "./index.ts";
import { errorKeys } from "./testing/fixtures.ts";

const ok = {
  idempotencyKey: "3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c",
  expectedVersion: 1,
  suppressionThreshold: 10,
  justification: "Pilot review asked for a stricter threshold.",
};

describe("Admin settings (ADM-09)", () => {
  it("accepts an integer threshold inside the governance range", () => {
    expect(ADMIN_THRESHOLD_MIN).toBe(3);
    expect(ADMIN_THRESHOLD_MAX).toBe(20);
    expect(errorKeys(AdminSettingsUpdateInputSchema, ok)).toEqual({});
    expect(errorKeys(AdminSettingsUpdateInputSchema, { ...ok, suppressionThreshold: 3 })).toEqual(
      {},
    );
    expect(errorKeys(AdminSettingsUpdateInputSchema, { ...ok, suppressionThreshold: 20 })).toEqual(
      {},
    );
  });

  it("rejects values below the governance floor, above the max, fractions and short reasons", () => {
    for (const value of [2, 0, -1, 21]) {
      expect(
        errorKeys(AdminSettingsUpdateInputSchema, { ...ok, suppressionThreshold: value }),
      ).toEqual({ suppressionThreshold: "numberOutOfRange" });
    }
    expect(errorKeys(AdminSettingsUpdateInputSchema, { ...ok, suppressionThreshold: 5.5 })).toEqual(
      {
        suppressionThreshold: "integerRequired",
      },
    );
    expect(errorKeys(AdminSettingsUpdateInputSchema, { ...ok, justification: "short" })).toEqual({
      justification: "tooShort",
    });
  });

  it("the stored record carries version and editor", () => {
    expect(
      AdminSettingsSchema.safeParse({
        id: "admin-settings",
        suppressionThreshold: 5,
        updatedBy: null,
        updatedAt: "2026-10-14T06:00:00.000Z",
        version: 1,
      }).success,
    ).toBe(true);
  });
});
