import { ForbiddenError } from "@laif/auth-demo";
import { DomainInvariantError, IllegalTransitionError } from "@laif/domain";
import { describe, expect, it } from "vitest";

import { isRepositoryError, RepositoryError, toRepositoryError } from "./errors.ts";

describe("RepositoryError mapping", () => {
  it("carries code, HTTP-like status and an optional reason / invariant code", () => {
    const e = new RepositoryError("CONFLICT", { reason: "ALREADY_DECIDED" });
    expect(e).toMatchObject({
      code: "CONFLICT",
      status: 409,
      reason: "ALREADY_DECIDED",
      name: "RepositoryError",
    });
    expect(e.message).toBe("CONFLICT (ALREADY_DECIDED)");
    expect(e.retryable).toBe(false);
    expect(new RepositoryError("TIMEOUT").retryable).toBe(true);
    expect(e.toShape()).toEqual({ code: "CONFLICT", status: 409, reason: "ALREADY_DECIDED" });
    expect(isRepositoryError(e)).toBe(true);
    expect(isRepositoryError(new Error("x"))).toBe(false);
  });

  it("DomainInvariantError → VALIDATION_ERROR with invariantCode (STALE_VERSION → CONFLICT)", () => {
    const v = toRepositoryError(
      new DomainInvariantError("COMPLETION_EVIDENCE_REQUIRED", { missing: "type" }),
    );
    expect(v).toMatchObject({
      code: "VALIDATION_ERROR",
      invariantCode: "COMPLETION_EVIDENCE_REQUIRED",
      details: { missing: "type" },
    });
    expect(v.message).toContain("[COMPLETION_EVIDENCE_REQUIRED]");
    expect(v.toShape()).toEqual({
      code: "VALIDATION_ERROR",
      status: 422,
      invariantCode: "COMPLETION_EVIDENCE_REQUIRED",
      details: { missing: "type" },
    });
    expect(toRepositoryError(new DomainInvariantError("STALE_VERSION"))).toMatchObject({
      code: "CONFLICT",
    });
  });

  it("IllegalTransitionError → INVALID_TRANSITION; ForbiddenError → FORBIDDEN; unknown → INTERNAL", () => {
    expect(
      toRepositoryError(new IllegalTransitionError("referral", "created", "completed")),
    ).toMatchObject({
      code: "VALIDATION_ERROR",
      reason: "INVALID_TRANSITION",
      details: { machine: "referral", from: "created", to: "completed" },
    });
    expect(toRepositoryError(new ForbiddenError("review.decide", "SCOPE"))).toMatchObject({
      code: "FORBIDDEN",
      reason: "SCOPE",
      details: { permission: "review.decide" },
    });
    expect(toRepositoryError("boom")).toMatchObject({
      code: "INTERNAL",
      status: 500,
      details: { message: "boom" },
    });
    const same = new RepositoryError("OFFLINE");
    expect(toRepositoryError(same)).toBe(same);
    expect(same.status).toBe(0);
    const full = new RepositoryError("VALIDATION_ERROR", {
      fieldErrors: { a: { key: "required", params: {} } },
      conflict: {
        entityType: "x",
        entityId: "1",
        expectedVersion: 1,
        currentVersion: 2,
        latest: {},
      },
    });
    expect(Object.keys(full.toShape()).sort()).toEqual([
      "code",
      "conflict",
      "fieldErrors",
      "status",
    ]);
  });
});
