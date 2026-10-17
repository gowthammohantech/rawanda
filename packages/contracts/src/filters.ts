/**
 * List / query filter schemas (FND-07 `list*` methods). Paging values are coerced so URL
 * search params can be parsed directly. App phases extend these (CLN `ReviewQueueFilterSchema`,
 * `PatientSearchSchema`, audit-filter extensions; ADM `AdminFilterSchema`).
 */
import {
  AUDIT_CATEGORIES,
  AUDIT_OUTCOMES,
  CARE_TASK_KINDS,
  CARE_TASK_STATUSES,
  ENTITY_TYPES,
  FOLLOW_UP_PURPOSES,
  FOLLOW_UP_STATUSES,
  REFERRAL_STATUSES,
  REVIEW_ORIGINS,
  REVIEW_PRIORITIES,
  REVIEW_QUEUE_SORTS,
  REVIEW_QUEUE_TABS,
  REVIEW_STATUSES,
  ROLES,
  SCREENING_STATUSES,
} from "@laif/domain";
import { z } from "zod";

import {
  CorrelationIdSchema,
  DistrictIdSchema,
  FacilityIdSchema,
  PatientIdSchema,
  PersonaIdSchema,
} from "./entities.ts";
import { vMsg } from "./messages.ts";
import { IsoDate, IsoUtcString } from "./primitives.ts";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

export const PageRequestSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PageRequest = z.output<typeof PageRequestSchema>;

const pageShape = PageRequestSchema.shape;
const facilityIds = z.array(FacilityIdSchema).optional();
const districtIds = z.array(DistrictIdSchema).optional();

/** Adds `to: dateRangeOrder` when both bounds are set and `from > to`. */
function refineRange<T extends { from?: string | undefined; to?: string | undefined }>(
  value: T,
  ctx: z.core.$RefinementCtx<T>,
): void {
  if (value.from !== undefined && value.to !== undefined && value.from > value.to) {
    ctx.addIssue({ code: "custom", path: ["to"], message: vMsg("dateRangeOrder") });
  }
}

export const PatientFilterSchema = z.object({
  ...pageShape,
  /** Free-text search over display name / synthetic identifier. */
  q: z.string().trim().max(100).optional(),
  facilityIds,
  districtIds,
});
export type PatientFilter = z.output<typeof PatientFilterSchema>;

/** CLN-03 patient search: the clinical search page size (fixed). */
export const PATIENT_SEARCH_PAGE_SIZE = 20;
/** CLN-03: minimum length of a non-empty patient search query. */
export const PATIENT_SEARCH_MIN_QUERY = 2;
export const PATIENT_SEARCH_MAX_QUERY = 60;

/**
 * CLN-03 clinical patient search (URL `?q=&facility=&page=`). An empty / blank `q` means "no
 * query" (the recent-in-facility list); a non-empty `q` needs at least 2 characters
 * (`validation:minLength`). `pageSize` is fixed at 20.
 */
export const PatientSearchSchema = z.object({
  q: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .trim()
      .min(PATIENT_SEARCH_MIN_QUERY, {
        error: vMsg("minLength", { min: PATIENT_SEARCH_MIN_QUERY }),
      })
      .max(PATIENT_SEARCH_MAX_QUERY, { error: vMsg("tooLong", { max: PATIENT_SEARCH_MAX_QUERY }) })
      .optional(),
  ),
  facilityId: FacilityIdSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.literal(PATIENT_SEARCH_PAGE_SIZE).default(PATIENT_SEARCH_PAGE_SIZE),
});
export type PatientSearchInput = z.input<typeof PatientSearchSchema>;
export type PatientSearch = z.output<typeof PatientSearchSchema>;

export const ScreeningFilterSchema = z
  .object({
    ...pageShape,
    patientId: PatientIdSchema.optional(),
    statuses: z.array(z.enum(SCREENING_STATUSES)).optional(),
    facilityIds,
    districtIds,
    from: IsoUtcString.optional(),
    to: IsoUtcString.optional(),
  })
  .superRefine(refineRange);
export type ScreeningFilter = z.output<typeof ScreeningFilterSchema>;

/** CLN-05: maximum length of the in-queue search. */
export const REVIEW_QUEUE_MAX_QUERY = 60;

export const ReviewFilterSchema = z.object({
  ...pageShape,
  statuses: z.array(z.enum(REVIEW_STATUSES)).optional(),
  priorities: z.array(z.enum(REVIEW_PRIORITIES)).optional(),
  origins: z.array(z.enum(REVIEW_ORIGINS)).optional(),
  assignedClinicianId: PersonaIdSchema.nullable().optional(),
  patientId: PatientIdSchema.optional(),
  facilityIds,
  /** Derived: review due date passed while not decided (demo fixture SLA only). */
  overdueOnly: z.boolean().optional(),
  /** CLN-05: one queue tab (the shared `@laif/domain` predicate); ignored by `countReviews`. */
  tab: z.enum(REVIEW_QUEUE_TABS).optional(),
  /** CLN-05: case-insensitive match on the patient's display name / synthetic identifier. */
  q: z.string().trim().max(REVIEW_QUEUE_MAX_QUERY).optional(),
  /** CLN-05 queue order (default `flaggedAt_asc` = oldest flag first); `listReviews` only. */
  sort: z.enum(REVIEW_QUEUE_SORTS).optional(),
  /** CLN-05 KPI "reviewed this week": only reviews decided at or after this instant. */
  decidedSince: IsoUtcString.optional(),
});
export type ReviewFilter = z.output<typeof ReviewFilterSchema>;

/** Assignee filter of the review queue (`me` = the signed-in persona). */
export const REVIEW_QUEUE_ASSIGNEES = ["any", "me", "unassigned"] as const;
export type ReviewQueueAssignee = (typeof REVIEW_QUEUE_ASSIGNEES)[number];

/**
 * CLN-05 review-queue URL state (`?tab=&facility=&assignee=&q=&sort=&page=`). The app maps it onto
 * `ReviewFilterSchema` (`facilityId` → `facilityIds`, `assignee` → `assignedClinicianId`) so the
 * list and `countReviews` use the same facility / assignee / search filter. `facilityId` must be
 * one of the persona's permitted facilities (checked by the app; the repository re-checks scope).
 */
export const ReviewQueueFilterSchema = z.object({
  tab: z.enum(REVIEW_QUEUE_TABS).default("pending"),
  facilityId: FacilityIdSchema.optional(),
  assignee: z.enum(REVIEW_QUEUE_ASSIGNEES).default("any"),
  q: z.string().trim().max(REVIEW_QUEUE_MAX_QUERY).optional(),
  sort: z.enum(REVIEW_QUEUE_SORTS).default("flaggedAt_asc"),
  page: z.coerce.number().int().min(1).default(1),
});
export type ReviewQueueFilterInput = z.input<typeof ReviewQueueFilterSchema>;
export type ReviewQueueFilter = z.output<typeof ReviewQueueFilterSchema>;
/** CLN-05: rows per queue page. */
export const REVIEW_QUEUE_PAGE_SIZE = 25;

export const ReferralFilterSchema = z.object({
  ...pageShape,
  statuses: z.array(z.enum(REFERRAL_STATUSES)).optional(),
  priorities: z.array(z.enum(REVIEW_PRIORITIES)).optional(),
  patientId: PatientIdSchema.optional(),
  facilityIds,
  destinationFacilityIds: z.array(FacilityIdSchema).optional(),
  assignedWorkerId: PersonaIdSchema.optional(),
  /** Derived `overdue` (never a stored status). */
  overdueOnly: z.boolean().optional(),
  /** CLN-08: free text over patient display name / synthetic identifier and destination. */
  q: z.string().trim().max(REVIEW_QUEUE_MAX_QUERY).optional(),
});
export type ReferralFilter = z.output<typeof ReferralFilterSchema>;

export const FollowUpFilterSchema = z.object({
  ...pageShape,
  statuses: z.array(z.enum(FOLLOW_UP_STATUSES)).optional(),
  purposes: z.array(z.enum(FOLLOW_UP_PURPOSES)).optional(),
  patientId: PatientIdSchema.optional(),
  facilityIds,
  assignedWorkerId: PersonaIdSchema.nullable().optional(),
  /** Derived `overdue` (never a stored status). */
  overdueOnly: z.boolean().optional(),
});
export type FollowUpFilter = z.output<typeof FollowUpFilterSchema>;

export const TaskFilterSchema = z.object({
  ...pageShape,
  kinds: z.array(z.enum(CARE_TASK_KINDS)).optional(),
  statuses: z.array(z.enum(CARE_TASK_STATUSES)).optional(),
  assignedToId: PersonaIdSchema.nullable().optional(),
  patientId: PatientIdSchema.optional(),
  facilityIds,
});
export type TaskFilter = z.output<typeof TaskFilterSchema>;

export const AuditFilterSchema = z
  .object({
    ...pageShape,
    /** Action name or dot prefix (e.g. `review.` matches `review.decided`). */
    action: z.string().trim().max(100).optional(),
    actorId: PersonaIdSchema.optional(),
    actorRole: z.enum(ROLES).optional(),
    categories: z.array(z.enum(AUDIT_CATEGORIES)).optional(),
    outcome: z.enum(AUDIT_OUTCOMES).optional(),
    entityType: z.enum(ENTITY_TYPES).optional(),
    entityId: z.string().trim().min(1).optional(),
    patientId: PatientIdSchema.optional(),
    correlationId: CorrelationIdSchema.optional(),
    facilityIds,
    districtIds,
    from: IsoUtcString.optional(),
    to: IsoUtcString.optional(),
  })
  .superRefine(refineRange);
export type AuditFilter = z.output<typeof AuditFilterSchema>;

/** Aggregate metrics filter: Kigali calendar days (`YYYY-MM-DD`), scope ids (FND-06). */
export const MetricsFilterSchema = z
  .object({
    from: IsoDate.optional(),
    to: IsoDate.optional(),
    districtIds,
    facilityIds,
  })
  .superRefine(refineRange);
export type MetricsFilter = z.output<typeof MetricsFilterSchema>;
