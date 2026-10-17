/**
 * Self-reported demo minutes by activity (ADM-05): `HBarList` of screening, follow-up, travel and
 * admin. Minutes are staff time (not patient counts), so they are shown as totals.
 */
import type { AggregateCell } from "@laif/analytics";
import { TIME_ENTRY_ACTIVITIES, type TimeEntryActivity } from "@laif/contracts";
import { Card, useTx, type TranslationKey } from "@laif/ui-web";
import type { ReactNode } from "react";

import { HBarList } from "../../components/charts/HBarList.tsx";
import { useMinutesFormat } from "./format.ts";
import { ProxyPill } from "./ProxyPill.tsx";

export function MinutesByActivity({
  minutes,
  threshold,
  info,
}: {
  minutes: Record<TimeEntryActivity, AggregateCell>;
  threshold: number;
  info?: ReactNode;
}) {
  const t = useTx();
  const format = useMinutesFormat();
  const title = t("admin:workload.activity.title");
  return (
    <Card
      title={title}
      meta={
        <span className="inline-flex items-center gap-1.5">
          <ProxyPill />
          {info}
        </span>
      }
    >
      <div data-testid="minutes-by-activity">
        <HBarList
          label={title}
          threshold={threshold}
          valueFormat={format}
          rows={TIME_ENTRY_ACTIVITIES.map((a) => ({
            id: a,
            label: t(`admin:workload.activity.${a}` as TranslationKey),
            value: minutes[a],
          }))}
        />
      </div>
    </Card>
  );
}
