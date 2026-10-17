/**
 * HWM-07 task detail hook. Two queries:
 * - `taskAccess`: the audited open (`followup.viewed`, or `access.denied` → denied). Runs once per
 *   open: never refetched by writes / focus / reconnect, and dropped from the cache when the
 *   screen unmounts (`gcTime: 0`), so the next open audits again.
 * - `taskDetail`: the silent re-read (no audit) seeded from the open, refreshed by
 *   `invalidateAfterWrite` (HWM-08 writes, sync passes, demo clock changes).
 */
import { useQuery } from "@tanstack/react-query";

import { getDetail, type TaskAccess, type TaskDetail } from "../../data/followUps.ts";
import { workerKeys } from "../../data/queryKeys.ts";
import { useRepository } from "../../providers.tsx";
import { useRequiredScope } from "../../session/useScope.ts";

export type TaskDetailView = {
  status: "loading" | "error" | "denied" | "ready";
  detail: TaskDetail | undefined;
  error: unknown;
  refetch: () => Promise<unknown>;
};

export function useTaskDetail(followUpId: string): TaskDetailView {
  const repo = useRepository();
  const scope = useRequiredScope();
  const input = { workerId: scope.personaId, facilityId: scope.facilityId };
  const access = useQuery({
    queryKey: workerKeys.taskAccess(scope.facilityId, followUpId),
    queryFn: () => getDetail(repo, input, followUpId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const opened = access.data?.status === "ok" ? access.data : undefined;
  const fresh = useQuery<TaskAccess>({
    queryKey: workerKeys.taskDetail(scope.facilityId, followUpId),
    queryFn: () => getDetail(repo, input, followUpId, { audit: false }),
    enabled: opened !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    ...(opened === undefined ? {} : { initialData: opened }),
  });

  if (access.isError) {
    return { status: "error", detail: undefined, error: access.error, refetch: access.refetch };
  }
  if (access.data?.status === "denied" || fresh.data?.status === "denied") {
    return { status: "denied", detail: undefined, error: null, refetch: access.refetch };
  }
  const detail = fresh.data?.status === "ok" ? fresh.data.detail : opened?.detail;
  return {
    status: detail === undefined ? "loading" : "ready",
    detail,
    error: null,
    refetch: () => fresh.refetch(),
  };
}
