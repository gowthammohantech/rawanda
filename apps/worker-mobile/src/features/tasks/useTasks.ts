/**
 * HWM-07 Tasks list hook: one filter (+ search) and all three tab counts from the local store,
 * computed at view time against the repository demo clock (`followUps.listByFilter`). Moving the
 * demo clock + `invalidateAfterWrite` re-buckets tasks without any write.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { listByFilter, type TaskFilter, type TaskList } from "../../data/followUps.ts";
import { workerKeys } from "../../data/queryKeys.ts";
import { useRepository } from "../../providers.tsx";
import { useRequiredScope } from "../../session/useScope.ts";

export type TasksView = {
  status: "loading" | "error" | "ready";
  data: TaskList | undefined;
  /** True while a new filter / search is loading (previous rows still shown). */
  switching: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
};

export function useTasks(filter: TaskFilter, query: string): TasksView {
  const repo = useRepository();
  const scope = useRequiredScope();
  const result = useQuery({
    queryKey: workerKeys.taskList(scope.personaId, scope.facilityId, filter, query),
    queryFn: () =>
      listByFilter(
        repo,
        { workerId: scope.personaId, facilityId: scope.facilityId },
        { filter, query },
      ),
    placeholderData: keepPreviousData,
  });
  return {
    status: result.isError ? "error" : result.data === undefined ? "loading" : "ready",
    data: result.data,
    switching: result.isPlaceholderData,
    error: result.error,
    refetch: () => result.refetch(),
  };
}
