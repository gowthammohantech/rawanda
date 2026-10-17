/**
 * Programme follow-up actions (ADM-03, FRD Scenario 1 "assign programme follow-up outside the
 * clinical decision workflow"): a NON-clinical task for a facility manager, e.g. a data
 * completeness check or a supervision visit. Collection `programmeActions` (pre-registered in the
 * FND-07 `COLLECTIONS` registry); entity type `programme_action`.
 *
 * Never a clinical decision: an action names a facility (and its district), never a patient,
 * screening, review or referral, and creating or updating one writes no clinical record.
 *
 * State machine (the FND-02 `careTaskMachine` statuses): `open → in_progress → done`,
 * `open | in_progress → cancelled_with_reason`; `done` / `cancelled_with_reason` are terminal.
 *
 * This module builds only on the primitives (no import of `entities.ts`, which registers the
 * schema in `ENTITY_SCHEMAS` — avoiding an import cycle).
 */
import {
  CARE_TASK_STATUSES,
  zonedDay,
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
  Reason,
  Version,
  boundedText,
  idSchema,
  optionalNote,
} from "./primitives.ts";

export const PROGRAMME_ACTION_CATEGORIES = [
  "data_completeness_check",
  "supervision_visit",
  "workload_review",
  "process_review",
  "other",
] as const;
export type ProgrammeActionCategory = (typeof PROGRAMME_ACTION_CATEGORIES)[number];

/** Same vocabulary as care tasks (`CARE_TASK_STATUSES`). */
export const PROGRAMME_ACTION_STATUSES = CARE_TASK_STATUSES;
export type ProgrammeActionStatus = (typeof PROGRAMME_ACTION_STATUSES)[number];

export const PROGRAMME_ACTION_TERMINAL_STATUSES = [
  "done",
  "cancelled_with_reason",
] as const satisfies readonly ProgrammeActionStatus[];

/** Only facility managers own programme actions (ADM-03 §5.6). */
export const PROGRAMME_ACTION_OWNER_ROLES = ["facility_manager"] as const;

/** Pages an action can be assigned from (`sourceContext.page`). */
export const PROGRAMME_ACTION_SOURCE_PAGES = ["funnel", "funnel_stage", "quality"] as const;

export const PROGRAMME_ACTION_TITLE_MIN = 5;
export const PROGRAMME_ACTION_TITLE_MAX = 120;
export const PROGRAMME_ACTION_NOTE_MAX = 500;
/** `dueDate` may be at most this many days after demo today (Kigali). */
export const PROGRAMME_ACTION_MAX_DUE_DAYS = 180;

const FacilityIdField = idSchema<FacilityId>();
const DistrictIdField = idSchema<DistrictId>();
const PersonaIdField = idSchema<PersonaId>();
const CorrelationIdField = idSchema<CorrelationId>();

/**
 * Where the action was assigned from: the page, the funnel stage and the global filter params
 * (`preset`, `from`, `to`, `district`, `facility`, `type`) as strings — aggregate context only.
 */
export const ProgrammeActionSourceContextSchema = z.object({
  page: z.enum(PROGRAMME_ACTION_SOURCE_PAGES),
  stage: z.string().trim().min(1).max(40).optional(),
  filters: z.record(z.string().max(40), z.string().max(100)).default({}),
});
export type ProgrammeActionSourceContext = z.output<typeof ProgrammeActionSourceContextSchema>;

export const ProgrammeActionSchema = z.object({
  version: Version,
  createdAt: IsoUtcString,
  updatedAt: IsoUtcString,
  synthetic: z.literal(true),
  id: NonEmptyTrimmed,
  idempotencyKey: NonEmptyTrimmed,
  facilityId: FacilityIdField,
  districtId: DistrictIdField,
  category: z.enum(PROGRAMME_ACTION_CATEGORIES),
  title: NonEmptyTrimmed,
  note: z.string(),
  ownerRole: z.enum(PROGRAMME_ACTION_OWNER_ROLES),
  /** Kigali calendar day `YYYY-MM-DD`. */
  dueDate: IsoDate,
  status: z.enum(PROGRAMME_ACTION_STATUSES),
  statusReason: z.string().exactOptional(),
  createdBy: PersonaIdField,
  updatedBy: PersonaIdField,
  sourceContext: ProgrammeActionSourceContextSchema,
});
export type ProgrammeAction = z.output<typeof ProgrammeActionSchema>;

/** `YYYY-MM-DD` plus `days`. */
function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export type ProgrammeActionSchemaDeps = { now?: () => Date };

/** The `dueDate` window: demo today (Kigali) … today + 180 days. */
export function programmeActionDueWindow(now: Date): { from: string; to: string } {
  const from = zonedDay(now).date;
  return { from, to: addDays(from, PROGRAMME_ACTION_MAX_DUE_DAYS) };
}

function dueDateField(deps: ProgrammeActionSchemaDeps) {
  if (deps.now === undefined) return IsoDate;
  const now = deps.now;
  return IsoDate.superRefine((value, ctx) => {
    const { from, to } = programmeActionDueWindow(now());
    if (value < from || value > to) {
      ctx.addIssue({ code: "custom", message: vMsg("dateOutOfRange", { from, to }) });
    }
  });
}

/**
 * Create input. Pass the demo clock as `now` to enforce the due-date window; omit it for
 * type-only checks. The district is derived from the facility by the repository; the facility
 * must be inside the actor's grant (checked by the repository, `FORBIDDEN`).
 */
export function createProgrammeActionInputSchema(deps: ProgrammeActionSchemaDeps = {}) {
  return z.object({
    idempotencyKey: IdempotencyKey,
    facilityId: FacilityIdField,
    category: z.enum(PROGRAMME_ACTION_CATEGORIES, {
      error: (issue) => (issue.input === undefined ? vMsg("required") : vMsg("invalidEnum")),
    }),
    title: boundedText(PROGRAMME_ACTION_TITLE_MIN, PROGRAMME_ACTION_TITLE_MAX),
    note: optionalNote(PROGRAMME_ACTION_NOTE_MAX).default(""),
    dueDate: dueDateField(deps),
    sourceContext: ProgrammeActionSourceContextSchema,
    /** The admin session's correlation id (audit `correlationId`). */
    correlationId: CorrelationIdField.optional(),
  });
}
export const ProgrammeActionInputSchema = createProgrammeActionInputSchema();
export type ProgrammeActionInput = z.output<typeof ProgrammeActionInputSchema>;

/**
 * Update input (status change and / or edits). `statusReason` (≥ 10 non-whitespace characters)
 * is required when cancelling. Terminal actions cannot be updated (repository).
 */
export function createProgrammeActionUpdateInputSchema(deps: ProgrammeActionSchemaDeps = {}) {
  return z
    .object({
      idempotencyKey: IdempotencyKey,
      id: NonEmptyTrimmed,
      expectedVersion: Version,
      status: z.enum(PROGRAMME_ACTION_STATUSES).optional(),
      statusReason: Reason.optional(),
      title: boundedText(PROGRAMME_ACTION_TITLE_MIN, PROGRAMME_ACTION_TITLE_MAX).optional(),
      note: optionalNote(PROGRAMME_ACTION_NOTE_MAX),
      dueDate: dueDateField(deps).optional(),
      correlationId: CorrelationIdField.optional(),
      /** Set when re-applying a change after a conflict (audited). */
      reapplied: z.boolean().optional(),
    })
    .superRefine((v, ctx) => {
      if (v.status === "cancelled_with_reason" && v.statusReason === undefined) {
        ctx.addIssue({ code: "custom", path: ["statusReason"], message: vMsg("required") });
      }
      if (
        v.status === undefined &&
        v.title === undefined &&
        v.note === undefined &&
        v.dueDate === undefined
      ) {
        ctx.addIssue({ code: "custom", path: [], message: vMsg("noChanges") });
      }
    });
}
export const ProgrammeActionUpdateInputSchema = createProgrammeActionUpdateInputSchema();
export type ProgrammeActionUpdateInput = z.output<typeof ProgrammeActionUpdateInputSchema>;

/** List filter (scope is applied by the repository). */
export const ProgrammeActionFilterSchema = z.object({
  facilityIds: z.array(FacilityIdField).optional(),
  districtIds: z.array(DistrictIdField).optional(),
  statuses: z.array(z.enum(PROGRAMME_ACTION_STATUSES)).optional(),
});
export type ProgrammeActionFilter = z.output<typeof ProgrammeActionFilterSchema>;

export function isTerminalProgrammeActionStatus(status: ProgrammeActionStatus): boolean {
  return (PROGRAMME_ACTION_TERMINAL_STATUSES as readonly string[]).includes(status);
}
