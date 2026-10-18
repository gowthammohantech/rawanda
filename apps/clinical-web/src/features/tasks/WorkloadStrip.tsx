/**
 * Worker workload (CLN-09, ref-image 1): per authorised CHW of the facility, open and overdue
 * task counts with a thin progress bar (share of the facility's open tasks) to support fair
 * assignment. Text always carries the numbers (never the bar alone).
 */
import type { FollowUp } from "@laif/domain";
import { Card, LoadingSkeleton, ProgressBar, useTx } from "@laif/ui-web";

import { personaName } from "../timeline/people.ts";
import { useWorkers } from "./hooks.ts";
import { workload } from "./model.ts";

export type WorkloadStripProps = { rows: readonly FollowUp[]; nowIso: string };

export function WorkloadStrip({ rows, nowIso }: WorkloadStripProps) {
  const t = useTx();
  const workers = useWorkers();
  if (workers.isPending) return <LoadingSkeleton lines={2} />;
  const ids = (workers.data ?? []).map((w) => w.id);
  const loads = workload(rows, ids, new Date(nowIso));
  const totalOpen = Math.max(
    1,
    loads.reduce((sum, l) => sum + l.open, 0),
  );
  return (
    <Card title={t("clinical:tasks.workload.title")}>
      <p className="text-muted m-0 mb-3 text-[13px]">{t("clinical:tasks.workload.body")}</p>
      {loads.length === 0 ? (
        <p className="text-muted m-0 text-[13px]" data-testid="workload-empty">
          {t("clinical:tasks.workload.empty")}
        </p>
      ) : (
        <ul
          className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="workload-strip"
        >
          {loads.map((load) => {
            const name = personaName(load.workerId) ?? load.workerId;
            return (
              <li key={load.workerId} data-testid="workload-worker" data-worker-id={load.workerId}>
                <ProgressBar
                  label={name}
                  value={load.open}
                  max={totalOpen}
                  tone={load.overdue > 0 ? "danger" : "primary"}
                  valueText={t("clinical:tasks.workload.counts", {
                    open: load.open,
                    overdue: load.overdue,
                  })}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
