/**
 * Governance records (ADM-01 / ADM-08):
 * - `AccessGrantSchema` — the reporting scope of an admin persona (collection `accessGrants`,
 *   entity type `access_grant`). FND-06 `scopeForPersona(persona, grant)` derives the actor scope;
 *   the grant `role` wins over the persona's role. Every edit bumps `version`; grants are never
 *   deleted — "Revoke now" sets `validTo`.
 * - `createAccessGrantUpdateInputSchema` — `updateAccessGrant` input (ADM-08 task 6): role (one of
 *   the four demo admin roles), districts (≥ 1), facilities (`ALL_IN_DISTRICTS` or ≥ 1 id),
 *   optional `validTo` (later than the demo now), required justification (10–300 characters).
 *   Facility ⊆ district, the lockout rule (`LAST_ADMIN`) and the version check are enforced by
 *   the repository.
 * - `RulesetHistoryEntry` — one row of `listRulesets()` (demo ruleset history; thresholds are
 *   deliberately NOT part of it: they are illustrative placeholders, never approved values).
 *
 * Built on the primitives only (no import of `entities.ts`, which registers `AccessGrantSchema`
 * in `ENTITY_SCHEMAS` — avoids an import cycle). DEMO ROLE SWITCH — NOT AUTHENTICATION.
 */
import {
  ROLES,
  type CorrelationId,
  type DistrictId,
  type FacilityId,
  type PersonaId,
  type ReasonCode,
  type Role,
} from "@laif/domain";
import { z } from "zod";

import { vMsg } from "./messages.ts";
import {
  boundedText,
  IdempotencyKey,
  IsoUtcString,
  NonEmptyTrimmed,
  Version,
  idSchema,
} from "./primitives.ts";

/** `facilityIds` value meaning "every facility of the granted districts". */
export const ALL_IN_DISTRICTS = "ALL_IN_DISTRICTS" as const;

const DistrictIdField = idSchema<DistrictId>();
const FacilityIdField = idSchema<FacilityId>();
const PersonaIdField = idSchema<PersonaId>();
const CorrelationIdField = idSchema<CorrelationId>();

export const AccessGrantSchema = z.object({
  version: Version,
  createdAt: IsoUtcString,
  updatedAt: IsoUtcString,
  synthetic: z.literal(true),
  id: NonEmptyTrimmed,
  personaId: PersonaIdField,
  role: z.enum(ROLES),
  districtIds: z.array(DistrictIdField),
  facilityIds: z.union([z.literal(ALL_IN_DISTRICTS), z.array(FacilityIdField)]),
  validFrom: IsoUtcString,
  validTo: IsoUtcString.exactOptional(),
  updatedBy: PersonaIdField,
});
export type AccessGrant = z.output<typeof AccessGrantSchema>;

/** The four demo admin roles a grant may carry (rule (c)). */
export const ACCESS_GRANT_ROLES = [
  "programme_lead",
  "district_analyst",
  "facility_manager",
  "auditor",
] as const satisfies readonly Role[];
export type AccessGrantRole = (typeof ACCESS_GRANT_ROLES)[number];

export const GRANT_JUSTIFICATION_MIN = 10;
export const GRANT_JUSTIFICATION_MAX = 300;

export type AccessGrantSchemaDeps = { now?: () => Date };

export function createAccessGrantUpdateInputSchema(deps: AccessGrantSchemaDeps = {}) {
  const now = deps.now ?? (() => new Date(0));
  return z
    .object({
      idempotencyKey: IdempotencyKey,
      id: NonEmptyTrimmed,
      expectedVersion: Version,
      role: z.enum(ACCESS_GRANT_ROLES, { error: vMsg("invalidEnum") }),
      districtIds: z.array(DistrictIdField),
      facilityIds: z.union([z.literal(ALL_IN_DISTRICTS), z.array(FacilityIdField)]),
      /** `null` / omitted = open-ended. Ignored (set to now) when `revoke` is true. */
      validTo: IsoUtcString.nullable().optional(),
      /** "Revoke now": the grant ends at the demo now (never deleted). */
      revoke: z.boolean().optional(),
      justification: boundedText(GRANT_JUSTIFICATION_MIN, GRANT_JUSTIFICATION_MAX),
      correlationId: CorrelationIdField.optional(),
    })
    .superRefine((v, ctx) => {
      // Rule (b): the scope must be non-empty.
      if (v.districtIds.length === 0) {
        ctx.addIssue({ code: "custom", path: ["districtIds"], message: vMsg("required") });
      }
      if (Array.isArray(v.facilityIds) && v.facilityIds.length === 0) {
        ctx.addIssue({ code: "custom", path: ["facilityIds"], message: vMsg("required") });
      }
      if (v.revoke !== true && v.validTo != null && Date.parse(v.validTo) <= now().getTime()) {
        ctx.addIssue({ code: "custom", path: ["validTo"], message: vMsg("dateMustBeFuture") });
      }
    });
}
export const AccessGrantUpdateInputSchema = createAccessGrantUpdateInputSchema();
export type AccessGrantUpdateInput = z.output<typeof AccessGrantUpdateInputSchema>;

export const RULESET_HISTORY_STATUSES = ["active", "retired"] as const;

/** `listRulesets()` row (ADM-08 task 2), newest `effectiveFrom` first. */
export type RulesetHistoryEntry = {
  version: string;
  status: (typeof RULESET_HISTORY_STATUSES)[number];
  /** UTC ISO. */
  effectiveFrom: string;
  /** UTC ISO; null while active. */
  effectiveTo: string | null;
  /** Who recorded the change (demo governance placeholder, never a clinical approver). */
  changedBy: string;
  /** Code of the change summary; UI copy `admin:governance.rulesets.change.<code>`. */
  changeSummaryKey: string;
  /** Reason codes this version can emit (display via `domain:reason.<code>`). */
  reasonCodes: ReasonCode[];
  /** Always `DEMO_RULE_NOT_CLINICALLY_VALIDATED`. */
  label: string;
  /** Always null: no clinical approval exists for any demo ruleset. */
  approvedBy: null;
};
