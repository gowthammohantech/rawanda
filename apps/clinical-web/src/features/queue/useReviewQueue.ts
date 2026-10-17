/**
 * Review-queue data (CLN-05 task 3). URL state is parsed with `ReviewQueueFilterSchema`; the list
 * (`clinicalKeys.reviews(fac, f)`) and the counts (`clinicalKeys.reviewCounts(fac, scope)`) use
 * the SAME facility / assignee / search filter, so every tab badge equals the rows of that tab.
 * Both refetch every 30 s (simulated new arrivals). The repository actor is narrowed to the
 * active facility (CLN-02), so no query can return out-of-scope rows.
 *
 * The unfiltered counts (`UNFILTERED_SCOPE`) feed the KPI strip AND the sidebar badge — one
 * shared cache entry (task 7).
 */
import type { Page } from "@laif/contracts";
import type { Patient, PersonaId, Review, Screening } from "@laif/domain";
import type { CareRepository, ReviewCounts } from "@laif/repositories";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";

import { clinicalKeys } from "../../data/queryKeys.ts";
import { useRepository } from "../../data/useRepository.ts";
import { useSession } from "../../session/useSession.ts";
import { demoNowIso } from "../patients/hooks.ts";
import { fetchAllPages } from "../patients/model.ts";
import { rememberQueueSearch } from "./lastSearch.ts";
import {
  parseQueueParams,
  patchQueueParams,
  REVIEW_QUEUE_PAGE_SIZE,
  scopeOf,
  startOfKigaliWeekIso,
  toRepositoryFilter,
  UNFILTERED_SCOPE,
  withoutFacilityParam,
  type QueueFilterPatch,
  type QueueScopeFilter,
} from "./model.ts";

/** Simulated arrivals: the queue polls the repository every 30 s. */
export const QUEUE_REFETCH_MS = 30_000;

type ScopeContext = { fac: string; personaId: PersonaId | string | null };

/** Counts query (shared by the queue tabs, the KPI strip and the sidebar badge). */
export function reviewCountsQuery(
  repo: CareRepository,
  { fac, personaId }: ScopeContext,
  scope: QueueScopeFilter,
  enabled = true,
) {
  return queryOptions({
    queryKey: clinicalKeys.reviewCounts(fac, scope),
    queryFn: (): Promise<ReviewCounts> =>
      repo.countReviews(toRepositoryFilter(scope, { facilityId: fac, personaId })),
    refetchInterval: QUEUE_REFETCH_MS,
    enabled,
  });
}

export type QueuePatientSummary = Pick<Patient, "id" | "displayName" | "syntheticIdentifier">;
export type QueueScreeningSummary = Pick<
  Screening,
  "id" | "source" | "rulesetVersion" | "measuredAt" | "glucoseUnit" | "glucoseContext"
>;

export type QueueItem = {
  review: Review;
  patient: QueuePatientSummary | null;
  screening: QueueScreeningSummary | null;
};

export type QueuePage = Page<QueueItem> & { nowIso: string };

async function loadQueuePage(
  repo: CareRepository,
  context: ScopeContext,
  filter: ReturnType<typeof parseQueueParams>["filter"],
): Promise<QueuePage> {
  const facilityIds = [context.fac];
  const [page, nowIso, patients, screenings] = await Promise.all([
    repo.listReviews({
      ...toRepositoryFilter(scopeOf(filter), {
        facilityId: context.fac,
        personaId: context.personaId,
      }),
      tab: filter.tab,
      sort: filter.sort,
      page: filter.page,
      pageSize: REVIEW_QUEUE_PAGE_SIZE,
    }),
    demoNowIso(repo),
    fetchAllPages((p, pageSize) => repo.listPatients({ facilityIds, page: p, pageSize })),
    fetchAllPages((p, pageSize) => repo.listScreenings({ facilityIds, page: p, pageSize })),
  ]);
  const patientById = new Map(patients.map((p) => [p.id as string, p]));
  const screeningById = new Map(screenings.map((s) => [s.id as string, s]));
  return {
    ...page,
    nowIso,
    items: page.items.map((review) => {
      const patient = patientById.get(review.patientId);
      const screening = screeningById.get(review.screeningId);
      return {
        review,
        patient:
          patient === undefined
            ? null
            : {
                id: patient.id,
                displayName: patient.displayName,
                syntheticIdentifier: patient.syntheticIdentifier,
              },
        screening:
          screening === undefined
            ? null
            : {
                id: screening.id,
                source: screening.source,
                rulesetVersion: screening.rulesetVersion,
                measuredAt: screening.measuredAt,
                glucoseUnit: screening.glucoseUnit,
                glucoseContext: screening.glucoseContext,
              },
      };
    }),
  };
}

/** URL state of the queue: parsed filter + an updater (push by default, replace on typing). */
export function useQueueUrlState() {
  const { permittedFacilityIds } = useSession();
  const [params, setParams] = useSearchParams();
  const parsed = useMemo(
    () => parseQueueParams(params, permittedFacilityIds),
    [params, permittedFacilityIds],
  );
  const written = useRef<string | null>(null);
  useEffect(() => {
    written.current = null;
    rememberQueueSearch(params.toString());
  }, [params]);
  const update = useCallback(
    (patch: QueueFilterPatch, options: { replace?: boolean; fromSearchBox?: boolean } = {}) => {
      // Base on the last write of this tick (React has not re-rendered yet), so a repeated
      // update — e.g. Radix selecting a tab on mousedown AND focus — adds no history entry.
      const base = new URLSearchParams(written.current ?? params.toString());
      const next = patchQueueParams(base, patch);
      if (next.toString() === base.toString()) return;
      written.current = next.toString();
      setParams(next, {
        replace: options.replace ?? false,
        state: options.fromSearchBox === true ? { fromQueueSearch: true } : null,
      });
    },
    [params, setParams],
  );
  const dropFacility = useCallback(
    () => setParams((current) => withoutFacilityParam(current), { replace: true }),
    [setParams],
  );
  return { ...parsed, update, dropFacility };
}

export function useReviewQueue(filter: ReturnType<typeof parseQueueParams>["filter"]) {
  const repo = useRepository();
  const { activeFacilityId, persona } = useSession();
  const context: ScopeContext = { fac: activeFacilityId ?? "none", personaId: persona?.id ?? null };
  const enabled = activeFacilityId !== null;

  const list = useQuery({
    queryKey: clinicalKeys.reviews(context.fac, {
      ...scopeOf(filter),
      tab: filter.tab,
      sort: filter.sort,
      page: filter.page,
    }),
    queryFn: () => loadQueuePage(repo, context, filter),
    placeholderData: keepPreviousData,
    refetchInterval: QUEUE_REFETCH_MS,
    enabled,
  });
  const counts = useQuery(reviewCountsQuery(repo, context, scopeOf(filter), enabled));
  return { list, counts };
}

/** KPI strip: unfiltered facility counts + reviews decided since Monday (Kigali). */
export function useQueueKpis() {
  const repo = useRepository();
  const { activeFacilityId, persona } = useSession();
  const fac = activeFacilityId ?? "none";
  const enabled = activeFacilityId !== null;
  const counts = useQuery(
    reviewCountsQuery(repo, { fac, personaId: persona?.id ?? null }, UNFILTERED_SCOPE, enabled),
  );
  const reviewedThisWeek = useQuery({
    queryKey: clinicalKeys.reviews(fac, { kpi: "reviewedThisWeek" }),
    queryFn: async () => {
      const since = startOfKigaliWeekIso(await demoNowIso(repo));
      const page = await repo.listReviews({
        facilityIds: [fac],
        decidedSince: since,
        page: 1,
        pageSize: 1,
      });
      return page.total;
    },
    refetchInterval: QUEUE_REFETCH_MS,
    enabled,
  });
  return { counts, reviewedThisWeek };
}
