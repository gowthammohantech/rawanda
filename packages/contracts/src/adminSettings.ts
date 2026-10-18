/**
 * Programme Admin settings (ADM-09): the demo-configurable small-cell suppression threshold.
 *
 * - `AdminSettingsSchema` — `{ id, suppressionThreshold, updatedBy, updatedAt, version }`, stored by
 *   the repository in store meta `admin.settings` (no extra collection); absent = the seed
 *   baseline (k = `DEMO_SMALL_CELL_THRESHOLD`, version 1, `updatedBy` null).
 * - `AdminSettingsUpdateInputSchema` — `updateAdminSettings` input: an integer threshold in
 *   `ADMIN_THRESHOLD_MIN`…`ADMIN_THRESHOLD_MAX`, `expectedVersion`, justification (10–300).
 *
 * `ADMIN_THRESHOLD_MIN` is the governance floor: no setting may go below it (demo placeholder,
 * not an approved value; `settings.privacy` holders only).
 */
import { z } from "zod";

import { vMsg } from "./messages.ts";
import {
  boundedText,
  IdempotencyKey,
  IsoUtcString,
  NonEmptyTrimmed,
  Version,
} from "./primitives.ts";

export const ADMIN_SETTINGS_ID = "admin-settings" as const;
/** Governance floor of the small-cell threshold (never lower). */
export const ADMIN_THRESHOLD_MIN = 3;
export const ADMIN_THRESHOLD_MAX = 20;
export const SETTINGS_JUSTIFICATION_MIN = 10;
export const SETTINGS_JUSTIFICATION_MAX = 300;

const rangeMsg = vMsg("numberOutOfRange", { min: ADMIN_THRESHOLD_MIN, max: ADMIN_THRESHOLD_MAX });

/** The threshold field (integer, governance range). */
export const SuppressionThreshold = z
  .number({ error: vMsg("integerRequired") })
  .int({ error: vMsg("integerRequired") })
  .min(ADMIN_THRESHOLD_MIN, { error: rangeMsg })
  .max(ADMIN_THRESHOLD_MAX, { error: rangeMsg });

export const AdminSettingsSchema = z.object({
  id: z.literal(ADMIN_SETTINGS_ID),
  suppressionThreshold: SuppressionThreshold,
  /** Persona id of the last editor; null for the seed baseline. */
  updatedBy: NonEmptyTrimmed.nullable(),
  updatedAt: IsoUtcString,
  version: Version,
});
export type AdminSettings = z.output<typeof AdminSettingsSchema>;

export const AdminSettingsUpdateInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  expectedVersion: Version,
  suppressionThreshold: SuppressionThreshold,
  justification: boundedText(SETTINGS_JUSTIFICATION_MIN, SETTINGS_JUSTIFICATION_MAX),
  correlationId: NonEmptyTrimmed.optional(),
});
export type AdminSettingsUpdateInput = z.output<typeof AdminSettingsUpdateInputSchema>;
