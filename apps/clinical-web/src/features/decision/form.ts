/**
 * Decision form model (CLN-07 task 2). The form keeps flat string inputs (one per field of every
 * outcome); `createDecisionFormSchema` picks the fields of the chosen `kind`, turns empty strings
 * into "missing" and parses the result with the FND-03 `createReviewDecisionInputSchema` (demo
 * clock → `dueAt` must be after demo now). There is NO app-local decision schema: every rule and
 * message (`validation:required`, `validation:reasonTooShort` {min}, `validation:dateMustBeFuture`,
 * `validation:tooShort` …) comes from the contract and is rendered in the active language by
 * `Field`.
 */
import {
  contractsErrorMap,
  createReviewDecisionInputSchema,
  vMsg,
  type ReviewDecisionInput,
} from "@laif/contracts";
import type { ReviewDecisionInputKind } from "@laif/domain";
import type { ReviewDecisionCall } from "@laif/repositories";
import { z } from "zod";

export type DecisionKind = ReviewDecisionInputKind;
/** Display order of the five UI options (PRD + spec merged; 1:1 with the FND-02 kinds). */
export const DECISION_KINDS = [
  "no_further_action",
  "refer",
  "request_repeat_screening",
  "plan_follow_up",
  "dismiss",
] as const satisfies readonly DecisionKind[];
/** Compile-time check: every FND-02 input kind is offered. */
export const DECISION_KINDS_COMPLETE: [
  Exclude<DecisionKind, (typeof DECISION_KINDS)[number]>,
] extends [never]
  ? true
  : never = true;

export type DecisionFormValues = {
  kind: DecisionKind | "";
  note: string;
  destinationFacilityId: string;
  referralReason: string;
  dueAt: string;
  priority: string;
  assignedWorkerId: string;
  instructionsForWorker: string;
  dismissReasonCode: string;
  reason: string;
};
export type DecisionFieldName = Exclude<keyof DecisionFormValues, "kind">;

export const EMPTY_DECISION_VALUES: DecisionFormValues = {
  kind: "",
  note: "",
  destinationFacilityId: "",
  referralReason: "",
  dueAt: "",
  priority: "",
  assignedWorkerId: "",
  instructionsForWorker: "",
  dismissReasonCode: "",
  reason: "",
};

/** Fields of each outcome, in display order (the first one receives focus). */
export const FIELDS_BY_KIND: Readonly<Record<DecisionKind, readonly DecisionFieldName[]>> = {
  no_further_action: ["note"],
  refer: ["destinationFacilityId", "referralReason", "priority", "dueAt"],
  request_repeat_screening: ["assignedWorkerId", "dueAt", "instructionsForWorker"],
  plan_follow_up: ["dueAt", "note", "assignedWorkerId"],
  dismiss: ["dismissReasonCode", "reason"],
};

/** Optional fields: an empty value is simply left out. */
const OPTIONAL: Partial<Record<DecisionKind, readonly DecisionFieldName[]>> = {
  plan_follow_up: ["assignedWorkerId"],
};

export const isDecisionKind = (value: unknown): value is DecisionKind =>
  typeof value === "string" && (DECISION_KINDS as readonly string[]).includes(value);

/** DOM id of a field's control (error-summary anchors, focus). */
export const fieldDomId = (name: DecisionFieldName | "kind") => `decision-${name}`;

export type DecisionFormContext = {
  reviewId: string;
  expectedVersion: number;
  /** Demo "now" (UTC ISO): `dueAt` must be later. */
  nowIso: string;
  /** Any valid key: the contract needs one; it is stripped from the output. */
  idempotencyKey: string;
};

/** The repository call (minus the idempotency key, which travels separately). */
export type DecisionVariables = ReviewDecisionCall;

/** Values of the chosen outcome only (switching outcome clears the others). */
export function valuesForKind(kind: DecisionKind): DecisionFormValues {
  return { ...EMPTY_DECISION_VALUES, kind };
}

export function createDecisionFormSchema(context: DecisionFormContext) {
  const contract = createReviewDecisionInputSchema({ now: () => new Date(context.nowIso) });
  return z
    .object({
      kind: z.string(),
      note: z.string(),
      destinationFacilityId: z.string(),
      referralReason: z.string(),
      dueAt: z.string(),
      priority: z.string(),
      assignedWorkerId: z.string(),
      instructionsForWorker: z.string(),
      dismissReasonCode: z.string(),
      reason: z.string(),
    })
    .transform((values, ctx): DecisionVariables => {
      if (!isDecisionKind(values.kind)) {
        ctx.addIssue({ code: "custom", path: ["kind"], message: vMsg("required") });
        return z.NEVER;
      }
      const kind = values.kind;
      const raw: Record<string, unknown> = {
        kind,
        reviewId: context.reviewId,
        expectedVersion: context.expectedVersion,
        idempotencyKey: context.idempotencyKey,
      };
      const optional = OPTIONAL[kind] ?? [];
      for (const name of FIELDS_BY_KIND[kind]) {
        const value = values[name];
        if (value.trim() === "") {
          // Missing → `validation:required` (an empty optional field is left out).
          if (!optional.includes(name)) raw[name] = undefined;
        } else raw[name] = value;
      }
      const parsed = contract.safeParse(raw, { error: contractsErrorMap });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const head = issue.path[0];
          const path = typeof head === "string" && head in values ? head : "kind";
          ctx.addIssue({ code: "custom", path: [path], message: issue.message });
        }
        return z.NEVER;
      }
      const variables: Partial<ReviewDecisionInput> = { ...parsed.data };
      delete variables.idempotencyKey;
      return variables as DecisionVariables;
    });
}

export type DecisionFormOutput = DecisionVariables;
