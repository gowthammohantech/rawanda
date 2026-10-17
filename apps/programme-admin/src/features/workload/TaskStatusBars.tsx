/**
 * Task status distribution (ADM-05): `HBarList` of completed / in progress / unable to reach /
 * overdue (mutually exclusive; they sum to the tasks assigned). Neutral bars only.
 */
import { WORKLOAD_TASK_STATES, type AggregateCell, type WorkloadTaskState } from "@laif/analytics";
import { Card, useTx, type TranslationKey } from "@laif/ui-web";
import type { ReactNode } from "react";

import { HBarList } from "../../components/charts/HBarList.tsx";

export function TaskStatusBars({
  states,
  threshold,
  info,
}: {
  states: Record<WorkloadTaskState, AggregateCell>;
  threshold: number;
  info?: ReactNode;
}) {
  const t = useTx();
  const title = t("admin:workload.status.title");
  return (
    <Card title={title} {...(info === undefined ? {} : { meta: info })}>
      <div data-testid="task-status">
        <HBarList
          label={title}
          threshold={threshold}
          rows={WORKLOAD_TASK_STATES.map((s) => ({
            id: s,
            label: t(`admin:workload.status.${s}` as TranslationKey),
            value: states[s],
          }))}
        />
      </div>
    </Card>
  );
}
