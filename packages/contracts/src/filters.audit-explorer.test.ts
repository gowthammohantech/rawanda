/** CLN-10: `AuditExplorerFilterSchema` (URL / form state) and the `AuditFilterSchema.actions` ext. */
import { describe, expect, it } from "vitest";

import { AuditExplorerFilterSchema, AuditFilterSchema } from "./filters.ts";

describe("AuditExplorerFilterSchema", () => {
  it("defaults family = all and page = 1; blank strings are 'not set'", () => {
    expect(
      AuditExplorerFilterSchema.parse({ actorId: " ", role: "", from: "", entityType: "" }),
    ).toEqual({ actionFamily: "all", page: 1 });
  });

  it("keeps valid values (trimmed) and coerces the page", () => {
    expect(
      AuditExplorerFilterSchema.parse({
        actionFamily: "review",
        chip: "deniedAccess",
        role: "clinician",
        entityType: "review",
        entityId: " rev-1 ",
        patient: "DEMO-P-0001",
        correlationId: "corr-1",
        from: "2026-10-01",
        to: "2026-10-14",
        page: "3",
      }),
    ).toMatchObject({ actionFamily: "review", entityId: "rev-1", page: 3, to: "2026-10-14" });
  });

  it("rejects from > to with validation:dateRangeOrder on `to`", () => {
    const result = AuditExplorerFilterSchema.safeParse({ from: "2026-10-14", to: "2026-10-01" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["to"],
      message: "validation:dateRangeOrder",
    });
  });

  it("rejects unknown families, chips and malformed dates", () => {
    expect(AuditExplorerFilterSchema.safeParse({ actionFamily: "nope" }).success).toBe(false);
    expect(AuditExplorerFilterSchema.safeParse({ chip: "nope" }).success).toBe(false);
    expect(AuditExplorerFilterSchema.safeParse({ from: "14/10/2026" }).success).toBe(false);
  });
});

describe("AuditFilterSchema.actions", () => {
  it("accepts a list of action names / prefixes", () => {
    expect(AuditFilterSchema.parse({ actions: ["review.decided", "referral."] }).actions).toEqual([
      "review.decided",
      "referral.",
    ]);
    expect(AuditFilterSchema.safeParse({ actions: [""] }).success).toBe(false);
  });
});
