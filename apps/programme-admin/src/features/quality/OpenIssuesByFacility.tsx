/**
 * Open (untriaged) issues per facility (ADM-06 task 7): the same `openQualityIssues` measure and
 * suppression as the overview's needs-attention card; a facility's count below k is hidden.
 */
import type { AggregateCell } from "@laif/analytics";
import { Card, useTx } from "@laif/ui-web";
import type { ReactNode } from "react";

import { facilityLabel } from "../../app/persona-labels.ts";
import { HBarList } from "../../components/charts/HBarList.tsx";

export function OpenIssuesByFacility({
  rows,
  threshold,
  info,
}: {
  rows: ReadonlyArray<{ facilityId: string; open: AggregateCell }>;
  threshold: number;
  info?: ReactNode;
}) {
  const t = useTx();
  const title = t("admin:quality.openByFacility.title");
  return (
    <Card title={title} {...(info === undefined ? {} : { meta: info })}>
      <div data-testid="open-by-facility">
        <HBarList
          label={title}
          threshold={threshold}
          rows={rows.map((r) => ({
            id: r.facilityId,
            label: facilityLabel(r.facilityId, t),
            value: r.open,
          }))}
        />
      </div>
    </Card>
  );
}
