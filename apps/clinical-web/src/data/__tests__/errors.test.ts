/** CLN-02 `toClinicalError` mapping (FRD §6 codes) and the read retry policy. */
import { RepositoryError } from "@laif/repositories";
import { describe, expect, it } from "vitest";

import { clinicalErrorKeys, shouldRetryRead, toClinicalError } from "../errors.ts";

describe("toClinicalError", () => {
  it.each([
    ["VALIDATION_ERROR", "VALIDATION_ERROR", false],
    ["FORBIDDEN", "FORBIDDEN", false],
    ["NOT_FOUND", "NOT_FOUND", false],
    ["CONFLICT", "CONFLICT", false],
    ["DEPENDENCY_UNAVAILABLE", "DEPENDENCY_UNAVAILABLE", true],
    ["OFFLINE", "OFFLINE", true],
    ["TIMEOUT", "TIMEOUT", true],
    ["INTERNAL", "DEPENDENCY_UNAVAILABLE", true],
  ] as const)("%s → %s", (source, code, retryable) => {
    const mapped = toClinicalError(new RepositoryError(source));
    expect(mapped).toMatchObject({ code, sourceCode: source, retryable });
  });

  it("keeps fieldErrors, conflict.latest, reason and the simulated flag", () => {
    const fieldErrors = { reason: { key: "reasonTooShort", params: { min: 10 } } } as const;
    expect(
      toClinicalError(new RepositoryError("VALIDATION_ERROR", { fieldErrors })).fieldErrors,
    ).toEqual(fieldErrors);
    const latest = { id: "rev-1", version: 4 };
    const conflict = toClinicalError(
      new RepositoryError("CONFLICT", {
        conflict: {
          entityType: "review",
          entityId: "rev-1",
          expectedVersion: 3,
          currentVersion: 4,
          latest,
        },
      }),
    );
    expect(conflict.latest).toEqual(latest);
    expect(conflict.conflict?.currentVersion).toBe(4);
    expect(toClinicalError(new RepositoryError("FORBIDDEN", { reason: "SCOPE" })).reason).toBe(
      "SCOPE",
    );
    expect(
      toClinicalError(new RepositoryError("OFFLINE", { details: { simulated: true } })).simulated,
    ).toBe(true);
  });

  it("maps unknown errors without leaking their message", () => {
    const mapped = toClinicalError(new TypeError("stack secret"));
    expect(mapped.code).toBe("DEPENDENCY_UNAVAILABLE");
    expect(JSON.stringify(mapped)).not.toContain("stack secret");
  });

  it("is idempotent and exposes the copy keys", () => {
    const once = toClinicalError(new RepositoryError("TIMEOUT"));
    expect(toClinicalError(once)).toBe(once);
    expect(clinicalErrorKeys("CONFLICT")).toEqual({
      title: "clinical:errors.CONFLICT.title",
      body: "clinical:errors.CONFLICT.body",
      action: "clinical:errors.CONFLICT.action",
    });
  });
});

describe("shouldRetryRead", () => {
  it("retries transient failures once and never FORBIDDEN / NOT_FOUND", () => {
    expect(shouldRetryRead(0, new RepositoryError("INTERNAL"))).toBe(true);
    expect(shouldRetryRead(1, new RepositoryError("INTERNAL"))).toBe(false);
    expect(shouldRetryRead(0, new RepositoryError("FORBIDDEN"))).toBe(false);
    expect(shouldRetryRead(0, new RepositoryError("NOT_FOUND"))).toBe(false);
  });
});
