/**
 * Pure helpers of the review queue (CLN-05): URL state ⇄ `ReviewQueueFilterSchema` (per-field
 * fallback to defaults; an out-of-scope facility is dropped and reported), the mapping onto the
 * repository `ReviewFilter` (list and counts share facility / assignee / search so badges
 * reconcile with rows), the row status pill priority and the Kigali week start.
 */
import {
  REVIEW_QUEUE_PAGE_SIZE,
  ReviewQueueFilterSchema,
  type ReviewQueueAssignee,
  type ReviewQueueFilter,
} from "@laif/contracts";
import { matchesReviewQueueTab, type PersonaId, type Review } from "@laif/domain";
import { KIGALI_UTC_OFFSET_MS } from "@laif/i18n";
import type { ReviewFilterInput } from "@laif/repositories";

export { REVIEW_QUEUE_PAGE_SIZE };

/** URL search-param names (`facilityId` is spelled `facility`, like the patient search). */
const PARAM = {
  tab: "tab",
  facilityId: "facility",
  assignee: "assignee",
  q: "q",
  sort: "sort",
  page: "page",
} as const satisfies Record<keyof ReviewQueueFilter, string>;

export const DEFAULT_QUEUE_FILTER: ReviewQueueFilter = ReviewQueueFilterSchema.parse({});

export type ParsedQueueParams = {
  filter: ReviewQueueFilter;
  /** A `?facility=` outside the persona's permitted set (dropped from the filter). */
  outOfScopeFacility: string | null;
};

/** `?tab=&facility=&assignee=&q=&sort=&page=` → queue filter; invalid values → defaults. */
export function parseQueueParams(
  params: URLSearchParams,
  permittedFacilityIds: readonly string[],
): ParsedQueueParams {
  const field = <K extends keyof ReviewQueueFilter>(key: K): ReviewQueueFilter[K] | undefined => {
    const raw = params.get(PARAM[key]);
    if (raw === null) return undefined;
    const parsed = ReviewQueueFilterSchema.safeParse({ [key]: raw });
    return parsed.success ? parsed.data[key] : undefined;
  };
  const q = field("q");
  const facility = field("facilityId");
  const inScope = facility !== undefined && permittedFacilityIds.includes(facility);
  const filter: ReviewQueueFilter = {
    tab: field("tab") ?? DEFAULT_QUEUE_FILTER.tab,
    assignee: field("assignee") ?? DEFAULT_QUEUE_FILTER.assignee,
    sort: field("sort") ?? DEFAULT_QUEUE_FILTER.sort,
    page: field("page") ?? 1,
    ...(q === undefined || q === "" ? {} : { q }),
    ...(inScope ? { facilityId: facility } : {}),
  };
  const rawFacility = params.get(PARAM.facilityId);
  return {
    filter,
    outOfScopeFacility: rawFacility !== null && rawFacility !== "" && !inScope ? rawFacility : null,
  };
}

export type QueueFilterPatch = Partial<Omit<ReviewQueueFilter, "q">> & { q?: string | undefined };

/**
 * Applies `patch` to the current URL params: defaults are omitted, and any change other than
 * `page` resets paging (counts and rows always restart on page 1).
 */
export function patchQueueParams(
  current: URLSearchParams,
  patch: QueueFilterPatch,
): URLSearchParams {
  const out = new URLSearchParams(current);
  const set = (key: keyof ReviewQueueFilter, value: string | undefined, fallback?: string) => {
    if (value === undefined || value === "" || value === fallback) out.delete(PARAM[key]);
    else out.set(PARAM[key], value);
  };
  if ("tab" in patch) set("tab", patch.tab, DEFAULT_QUEUE_FILTER.tab);
  if ("assignee" in patch) set("assignee", patch.assignee, DEFAULT_QUEUE_FILTER.assignee);
  if ("sort" in patch) set("sort", patch.sort, DEFAULT_QUEUE_FILTER.sort);
  if ("q" in patch) set("q", patch.q?.trim());
  if ("facilityId" in patch) set("facilityId", patch.facilityId);
  const onlyPage = Object.keys(patch).every((key) => key === "page");
  if (onlyPage && patch.page !== undefined) set("page", String(patch.page), "1");
  else out.delete(PARAM.page);
  return out;
}

/** Removes `?facility=` (out-of-scope value). */
export function withoutFacilityParam(current: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams(current);
  out.delete(PARAM.facilityId);
  return out;
}

/** The filter part shared by the list and the counts (no tab, sort or paging). */
export type QueueScopeFilter = { assignee: ReviewQueueAssignee; q: string };

export const scopeOf = (filter: Pick<ReviewQueueFilter, "assignee" | "q">): QueueScopeFilter => ({
  assignee: filter.assignee,
  q: filter.q ?? "",
});

/** The unfiltered facility view: KPI strip + sidebar badge (one shared cache entry). */
export const UNFILTERED_SCOPE: QueueScopeFilter = { assignee: "any", q: "" };

/** Queue scope → repository filter (facility = the active facility). */
export function toRepositoryFilter(
  scope: QueueScopeFilter,
  context: { facilityId: string; personaId: string | null },
): ReviewFilterInput {
  return {
    facilityIds: [context.facilityId],
    ...(scope.q === "" ? {} : { q: scope.q }),
    ...(scope.assignee === "me" && context.personaId !== null
      ? { assignedClinicianId: context.personaId }
      : {}),
    ...(scope.assignee === "unassigned" ? { assignedClinicianId: null } : {}),
  };
}

export type QueuePill =
  | { kind: "overdue" }
  | { kind: "urgentDemo" }
  | { kind: "inReview"; by: PersonaId | null }
  | { kind: "needsReview" }
  | { kind: "decided"; status: Review["status"] };

type PillReview = Pick<
  Review,
  "status" | "priority" | "reviewDueAt" | "assignedClinicianId" | "startedBy"
>;

/** Row pill priority: OVERDUE > URGENT · DEMO > IN REVIEW (by X) > NEEDS REVIEW (task 6). */
export function queuePill(
  review: PillReview,
  context: { now: Date; personaId: PersonaId | null },
): QueuePill {
  if (review.status !== "pending" && review.status !== "in_review") {
    return { kind: "decided", status: review.status };
  }
  if (matchesReviewQueueTab(review, "overdue", context)) return { kind: "overdue" };
  if (matchesReviewQueueTab(review, "urgent", context)) return { kind: "urgentDemo" };
  if (review.status === "in_review") return { kind: "inReview", by: review.startedBy };
  return { kind: "needsReview" };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Kigali Monday 00:00 of the week containing `nowIso`, as a UTC ISO instant. */
export function startOfKigaliWeekIso(nowIso: string): string {
  const kigali = Date.parse(nowIso) + KIGALI_UTC_OFFSET_MS;
  const midnight = Math.floor(kigali / DAY_MS) * DAY_MS;
  const dayOfWeek = (new Date(midnight).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(midnight - dayOfWeek * DAY_MS - KIGALI_UTC_OFFSET_MS).toISOString();
}
