/**
 * Aggregate export records (ADM-07, PA-07, FRD Scenario 2 / §4 "permission enforcement … on every
 * export"). Collection `exportAudits` (pre-registered in the FND-07 `COLLECTIONS` registry);
 * entity type `export_audit`.
 *
 * - `ExportAuditSchema` — one record per export ATTEMPT that reached the repository: `generated`
 *   (one per idempotency key; it keeps the exact CSV bytes so a retry re-downloads the same
 *   file) or `denied` (capability / scope; no file). Access reports therefore include failures.
 * - `ExportReasonSchema` — the reason step of the report builder (reason code, free text
 *   required for `other`, aggregate-only acknowledgement). Messages are `validation:*` keys.
 * - `ExportRequestSchema` — what the admin export service receives (template, granularity, the
 *   reason and the idempotency key created when the export step opens).
 *
 * Privacy: an export record names a template, a scope (district / facility ids), a period and
 * counts — never a patient identifier. `csvText` is the aggregate CSV itself (watermarked,
 * suppressed cells blank).
 *
 * This module builds only on the primitives (no import of `entities.ts`, which registers the
 * schema in `ENTITY_SCHEMAS` — avoiding an import cycle).
 */
import {
  ROLES,
  type CorrelationId,
  type DistrictId,
  type FacilityId,
  type PersonaId,
} from "@laif/domain";
import { z } from "zod";

import { vMsg } from "./messages.ts";
import {
  IdempotencyKey,
  IsoDate,
  IsoUtcString,
  NonEmptyTrimmed,
  Version,
  idSchema,
} from "./primitives.ts";

/** ADM-07 export reason codes (demo placeholders). */
export const EXPORT_REASON_CODES = [
  "programme_review",
  "district_meeting",
  "data_quality_followup",
  "evaluation_reporting",
  "other",
] as const;
export type ExportReasonCode = (typeof EXPORT_REASON_CODES)[number];

export const EXPORT_GRANULARITIES = ["scope_total", "district", "facility", "week"] as const;
export type ExportGranularity = (typeof EXPORT_GRANULARITIES)[number];
export const EXPORT_REASON_TEXT_MIN = 10;
export const EXPORT_REASON_TEXT_MAX = 300;

export const EXPORT_AUDIT_STATUSES = ["generated", "denied"] as const;
export type ExportAuditStatus = (typeof EXPORT_AUDIT_STATUSES)[number];

/** Why an export was refused: the role lacks `export.aggregate`, or the scope is outside the grant. */
export const EXPORT_DENIAL_REASONS = ["capability", "scope"] as const;
export type ExportDenialReason = (typeof EXPORT_DENIAL_REASONS)[number];

/** Maximum stored CSV size (the demo db keeps the bytes for idempotent re-downloads). */
export const EXPORT_CSV_MAX_CHARS = 2_000_000;

/** File name `laif-demo_<template>_<scope>_<from>_<to>_<exportId8>.csv` (ASCII, no path). */
export const EXPORT_FILE_NAME_PATTERN =
  /^laif-demo_[a-z0-9_]+_[A-Za-z0-9_-]+_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_[0-9a-f]{8}\.csv$/;

const FacilityIdField = idSchema<FacilityId>();
const DistrictIdField = idSchema<DistrictId>();
const PersonaIdField = idSchema<PersonaId>();
const CorrelationIdField = idSchema<CorrelationId>();

export const ExportScopeSchema = z.object({
  districtIds: z.array(DistrictIdField),
  facilityIds: z.array(FacilityIdField),
});
export type ExportScope = z.output<typeof ExportScopeSchema>;

export const ExportPeriodSchema = z.object({ from: IsoDate, to: IsoDate });
export type ExportPeriod = z.output<typeof ExportPeriodSchema>;

const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/u, { error: vMsg("invalidFormat") });

export const ExportAuditSchema = z.object({
  id: NonEmptyTrimmed,
  version: Version,
  createdAt: IsoUtcString,
  updatedAt: IsoUtcString,
  synthetic: z.literal(true),
  idempotencyKey: IdempotencyKey,
  actorId: PersonaIdField.nullable(),
  role: z.enum(ROLES).nullable(),
  grantId: z.string().nullable(),
  correlationId: CorrelationIdField.nullable(),
  scope: ExportScopeSchema,
  period: ExportPeriodSchema.nullable(),
  template: NonEmptyTrimmed,
  granularity: z.enum(EXPORT_GRANULARITIES),
  reasonCode: z.enum(EXPORT_REASON_CODES),
  reasonText: z.string().nullable(),
  rowCount: z.number().int().min(0),
  suppressedCells: z.number().int().min(0),
  /** SHA-256 of the data rows (`# END … sha256=`); null when denied. */
  sha256: Sha256Hex.nullable(),
  fileName: z.string().regex(EXPORT_FILE_NAME_PATTERN).nullable(),
  /** The exact CSV (BOM included) for idempotent re-downloads; null when denied. */
  csvText: z.string().max(EXPORT_CSV_MAX_CHARS).nullable(),
  status: z.enum(EXPORT_AUDIT_STATUSES),
  deniedReason: z.enum(EXPORT_DENIAL_REASONS).nullable(),
});
export type ExportAudit = z.output<typeof ExportAuditSchema>;

/** Report-builder reason step: code, free text (required for `other`), acknowledgement. */
export const ExportReasonSchema = z
  .object({
    reasonCode: z.enum(EXPORT_REASON_CODES, { error: vMsg("required") }),
    reasonText: z
      .string()
      .trim()
      .max(EXPORT_REASON_TEXT_MAX, {
        error: vMsg("tooLong", { max: EXPORT_REASON_TEXT_MAX }),
      }),
    acknowledgeAggregateOnly: z.literal(true, { error: vMsg("required") }),
  })
  .superRefine((v, ctx) => {
    const length = v.reasonText.length;
    if (v.reasonCode === "other" && length < EXPORT_REASON_TEXT_MIN) {
      ctx.addIssue({
        code: "custom",
        path: ["reasonText"],
        message:
          length === 0 ? vMsg("required") : vMsg("tooShort", { min: EXPORT_REASON_TEXT_MIN }),
      });
    }
    if (v.reasonCode !== "other" && length > 0 && length < EXPORT_REASON_TEXT_MIN) {
      ctx.addIssue({
        code: "custom",
        path: ["reasonText"],
        message: vMsg("tooShort", { min: EXPORT_REASON_TEXT_MIN }),
      });
    }
  });
export type ExportReason = z.output<typeof ExportReasonSchema>;

/** `requestExport()` input (admin export service); the filters come from the URL. */
export const ExportRequestSchema = z.object({
  idempotencyKey: IdempotencyKey,
  template: NonEmptyTrimmed,
  granularity: z.enum(EXPORT_GRANULARITIES),
  reason: ExportReasonSchema,
});
export type ExportRequest = z.output<typeof ExportRequestSchema>;

/** History list filter (scope and visibility are applied by the repository). */
export const ExportAuditFilterSchema = z.object({
  idempotencyKey: IdempotencyKey.optional(),
  ids: z.array(z.string()).optional(),
  statuses: z.array(z.enum(EXPORT_AUDIT_STATUSES)).optional(),
});
export type ExportAuditFilter = z.output<typeof ExportAuditFilterSchema>;
