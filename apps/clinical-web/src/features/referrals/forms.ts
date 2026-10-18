/**
 * Referral dialog form schemas (CLN-08). Every form keeps flat string inputs; each schema turns
 * empty strings into "missing" and parses with the FND-03 contract — there is NO app-local
 * referral schema:
 * - transitions → `createReferralTransitionInputSchema({ now })` (demo clock: `completedAt` may
 *   not be in the future; completion needs timestamp + outcome + evidence type + reference);
 * - edit → `ReferralEditInputSchema` (`changeReason` ≥ 10 non-space chars; at least one change);
 * - create → `ReferralInputSchema`.
 * Due dates set here must be after demo now (`validation:dateMustBeFuture`). Messages are
 * `validation:*` keys rendered in the active language by `Field`.
 */
import {
  contractsErrorMap,
  createReferralTransitionInputSchema,
  ReferralEditInputSchema,
  ReferralInputSchema,
  vMsg,
} from "@laif/contracts";
import type { ReferralCall, ReferralEditCall, ReferralTransitionCall } from "@laif/repositories";
import type { Referral, Review } from "@laif/domain";
import { z } from "zod";

/** Any valid key: the contracts need one; it is stripped from the output. */
const PARSE_KEY = "00000000-0000-4000-8000-000000000000";

type Values = Record<string, string>;

/** Parses `raw` with `contract`; issues land on the form field of the same name (else `fallback`). */
function applyContract<T>(
  contract: z.ZodType<T>,
  raw: Record<string, unknown>,
  values: Values,
  ctx: z.RefinementCtx,
  fallback: string,
): T | typeof z.NEVER {
  const parsed = contract.safeParse(raw, { error: contractsErrorMap });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const head = issue.path[0];
      const path = typeof head === "string" && head in values ? head : fallback;
      ctx.addIssue({ code: "custom", path: [path], message: issue.message });
    }
    return z.NEVER;
  }
  return parsed.data;
}

const blankToUndefined = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === "" ? undefined : value;

function stripKey<T extends { idempotencyKey?: string }>(value: T): Omit<T, "idempotencyKey"> {
  const out: T = { ...value };
  delete out.idempotencyKey;
  return out;
}

function futureCheck(value: string, nowIso: string, path: string, ctx: z.RefinementCtx): boolean {
  if (value !== "" && Date.parse(value) <= Date.parse(nowIso)) {
    ctx.addIssue({ code: "custom", path: [path], message: vMsg("dateMustBeFuture") });
    return false;
  }
  return true;
}

const strings = <K extends string>(keys: readonly K[]) =>
  z.object(Object.fromEntries(keys.map((k) => [k, z.string()])) as Record<K, z.ZodString>);

export type TransitionTarget = ReferralTransitionCall["to"];
/** Repository calls; the idempotency key travels separately (`useIdempotentMutation`). */
export type TransitionVariables = ReferralTransitionCall;
export type EditVariables = ReferralEditCall;
export type CreateVariables = ReferralCall;

export type TransitionContext = {
  referral: Pick<Referral, "id" | "version">;
  /** Demo "now" (UTC ISO). */
  nowIso: string;
};

// ── Transitions ──────────────────────────────────────────────────────────────

const transitionFields = {
  accepted: ["note"],
  scheduled: ["appointmentAt"],
  completed: ["completedAt", "outcome", "evidenceType", "evidenceReference", "note"],
  cancelled_with_reason: ["cancelReasonCode", "reason"],
} as const satisfies Record<TransitionTarget, readonly string[]>;

/** Optional fields (an empty value is left out). */
const OPTIONAL_FIELDS: ReadonlySet<string> = new Set(["note"]);

export type TransitionFormValues<T extends TransitionTarget> = Record<
  (typeof transitionFields)[T][number],
  string
>;

export function emptyTransitionValues<T extends TransitionTarget>(to: T): TransitionFormValues<T> {
  return Object.fromEntries(transitionFields[to].map((k) => [k, ""])) as TransitionFormValues<T>;
}

export function createTransitionFormSchema<T extends TransitionTarget>(
  to: T,
  context: TransitionContext,
) {
  const contract = createReferralTransitionInputSchema({ now: () => new Date(context.nowIso) });
  const fields = transitionFields[to] as readonly string[];
  const schema = strings(fields).transform((values: Values, ctx): TransitionVariables => {
    const raw: Record<string, unknown> = {
      to,
      referralId: context.referral.id,
      expectedVersion: context.referral.version,
      idempotencyKey: PARSE_KEY,
    };
    for (const name of fields) {
      const value = blankToUndefined(values[name]);
      if (value !== undefined) raw[name] = value;
      else if (!OPTIONAL_FIELDS.has(name)) raw[name] = undefined;
    }
    const parsed = applyContract(contract, raw, values, ctx, fields[0] ?? "note");
    if (parsed === z.NEVER) return z.NEVER;
    return stripKey(parsed) as TransitionVariables;
  });
  return schema as unknown as z.ZodType<TransitionVariables, TransitionFormValues<T>>;
}

// ── Edit (destination / due date) ────────────────────────────────────────────

export type EditFormValues = { destinationFacilityId: string; dueAt: string; changeReason: string };

export function editDefaults(referral: Referral): EditFormValues {
  return {
    destinationFacilityId: referral.destinationFacilityId,
    dueAt: referral.dueAt,
    changeReason: "",
  };
}

export function createEditFormSchema(context: TransitionContext & { referral: Referral }) {
  const { referral, nowIso } = context;
  const schema = strings(["destinationFacilityId", "dueAt", "changeReason"] as const).transform(
    (values: Values, ctx): EditVariables => {
      const destination = blankToUndefined(values["destinationFacilityId"]);
      const due = blankToUndefined(values["dueAt"]);
      const changedDestination =
        destination !== undefined && destination !== referral.destinationFacilityId;
      const changedDue = due !== undefined && due !== referral.dueAt;
      if (changedDue && !futureCheck(due, nowIso, "dueAt", ctx)) return z.NEVER;
      const raw: Record<string, unknown> = {
        referralId: referral.id,
        expectedVersion: referral.version,
        idempotencyKey: PARSE_KEY,
        changeReason: values["changeReason"],
        ...(changedDestination ? { destinationFacilityId: destination } : {}),
        ...(changedDue ? { dueAt: due } : {}),
      };
      const parsed = applyContract(ReferralEditInputSchema, raw, values, ctx, "dueAt");
      if (parsed === z.NEVER) return z.NEVER;
      return stripKey(parsed);
    },
  );
  return schema as unknown as z.ZodType<EditVariables, EditFormValues>;
}

// ── Create ───────────────────────────────────────────────────────────────────

export type CreateFormValues = {
  reviewId: string;
  destinationFacilityId: string;
  referralReason: string;
  priority: string;
  dueAt: string;
};

export const EMPTY_CREATE_VALUES: CreateFormValues = {
  reviewId: "",
  destinationFacilityId: "",
  referralReason: "",
  priority: "",
  dueAt: "",
};

export function createCreateFormSchema(context: {
  nowIso: string;
  reviews: readonly Pick<Review, "id" | "patientId">[];
}) {
  const schema = strings([
    "reviewId",
    "destinationFacilityId",
    "referralReason",
    "priority",
    "dueAt",
  ] as const).transform((values: Values, ctx): CreateVariables => {
    const review = context.reviews.find((r) => r.id === values["reviewId"]);
    if (values["reviewId"] !== "" && review === undefined) {
      ctx.addIssue({ code: "custom", path: ["reviewId"], message: vMsg("invalid") });
    }
    const due = values["dueAt"] ?? "";
    const futureOk = futureCheck(due, context.nowIso, "dueAt", ctx);
    const raw: Record<string, unknown> = {
      idempotencyKey: PARSE_KEY,
      reviewId: blankToUndefined(values["reviewId"]),
      patientId: review?.patientId ?? "unknown",
      destinationFacilityId: blankToUndefined(values["destinationFacilityId"]),
      referralReason: blankToUndefined(values["referralReason"]),
      priority: blankToUndefined(values["priority"]),
      dueAt: blankToUndefined(due),
    };
    const parsed = applyContract(ReferralInputSchema, raw, values, ctx, "reviewId");
    if (parsed === z.NEVER || !futureOk || review === undefined) return z.NEVER;
    return stripKey(parsed);
  });
  return schema as unknown as z.ZodType<CreateVariables, CreateFormValues>;
}
