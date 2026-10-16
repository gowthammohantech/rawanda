/**
 * `expectRepositoryError(promise, code, reason?)` — asserts that `promise` rejects with a
 * `RepositoryError` of `code` (and `reason`, when given) and returns it for further checks.
 */
import type { ErrorCode, ErrorReason } from "@laif/contracts";
import { RepositoryError } from "@laif/repositories";
import { expect } from "vitest";

export async function expectRepositoryError(
  promise: Promise<unknown>,
  code: ErrorCode,
  reason?: ErrorReason,
): Promise<RepositoryError> {
  let caught: unknown = undefined;
  let resolved = false;
  try {
    await promise;
    resolved = true;
  } catch (error) {
    caught = error;
  }
  expect(resolved, `expected a RepositoryError ${code}, but the promise resolved`).toBe(false);
  expect(caught).toBeInstanceOf(RepositoryError);
  const error = caught as RepositoryError;
  expect(error.code).toBe(code);
  if (reason !== undefined) expect(error.reason).toBe(reason);
  return error;
}
