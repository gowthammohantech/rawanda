/** Test-only fixtures (not exported from the package index). */
import type { PlausibilityLimits } from "@laif/domain";

import { safeParseToFieldErrors } from "../field-errors.ts";
import type { ParsedValidationMessage } from "../messages.ts";

/** Pinned demo clock instant (FND-02). */
export const NOW_ISO = "2026-10-14T06:00:00.000Z";
export const NOW = (): Date => new Date(NOW_ISO);
export const KEY = "3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c";

export const LIMITS: PlausibilityLimits = {
  systolic: { min: 60, max: 260 },
  diastolic: { min: 30, max: 160 },
  glucoseMmol: { min: 1, max: 35 },
  glucoseMgDl: { min: 18, max: 630 },
};

export const VALID_REASON = "Repeat reading was within the usual range";

export const base = {
  version: 1,
  createdAt: NOW_ISO,
  updatedAt: NOW_ISO,
  synthetic: true as const,
};

/** Field errors as `{ path: key }` (params dropped) for compact assertions. */
export function errorKeys(schema: Parameters<typeof safeParseToFieldErrors>[0], data: unknown) {
  const errors: Record<string, ParsedValidationMessage> = safeParseToFieldErrors(schema, data);
  return Object.fromEntries(Object.entries(errors).map(([path, m]) => [path, m.key]));
}
