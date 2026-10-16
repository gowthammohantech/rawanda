import type { AuditCategory, AuditOutcome, EntityType, Role } from "../enums.ts";
import type {
  AuditEventId,
  CorrelationId,
  DistrictId,
  FacilityId,
  PatientId,
  PersonaId,
} from "../ids.ts";
import type { IsoUtc, JsonValue, PersistedEntity } from "./base.ts";

/**
 * Tech spec §5.1 AuditEvent + extensions. Typed here; emission happens in FND-07.
 * `beforeHash` / `afterHash` are `fnv1a64Hex(canonicalJson(entity))` — NOT tamper-proof (§11).
 */
export type AuditEvent = PersistedEntity & {
  id: AuditEventId;
  actorId: PersonaId | null;
  actorRole: Role | null;
  /** Action name from the FND-07 audit action registry (dot names). */
  action: string;
  entityType: EntityType;
  entityId: string;
  beforeHash?: string;
  afterHash?: string;
  occurredAt: IsoUtc;
  correlationId: CorrelationId;
  // ext: governance grouping (PA audit views).
  category: AuditCategory;
  // ext: denied access is audited too (WF-04).
  outcome: AuditOutcome;
  // ext: scope columns for filtering.
  facilityId: FacilityId | null;
  districtId: DistrictId | null;
  patientId: PatientId | null;
  // ext: structured, non-identifying summary of what changed.
  changeSummary: JsonValue;
  // ext: reason given for sensitive access / export.
  justification: string | null;
};

/** Spec §5.1 `AccessEvent`: an audit event in the `access` category. */
export type AccessEvent = AuditEvent & { category: "access" };
