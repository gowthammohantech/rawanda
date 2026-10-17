/**
 * Missing fields by field (ADM-06): `HBarList` over `MANDATORY_SCREENING_FIELDS` (labels
 * `admin:quality.field.*`). A screening can miss several fields, so the bars do not sum to the
 * KPI; each count is suppressed below k. Fields with no missing value are listed last as 0.
 */
import type { AggregateCell } from "@laif/analytics";
import { MANDATORY_SCREENING_FIELDS, type MandatoryScreeningField } from "@laif/contracts";
import { Card, useTx, type TranslationKey } from "@laif/ui-web";
import type { ReactNode } from "react";

import { HBarList } from "../../components/charts/HBarList.tsx";

export function MissingFieldBars({
  byField,
  threshold,
  info,
}: {
  byField: Record<MandatoryScreeningField, AggregateCell>;
  threshold: number;
  info?: ReactNode;
}) {
  const t = useTx();
  const title = t("admin:quality.bars.title");
  const value = (c: AggregateCell) => (c.suppressed ? 0.5 : (c.value ?? 0));
  const rows = [...MANDATORY_SCREENING_FIELDS]
    .sort((a, b) => value(byField[b]) - value(byField[a]))
    .map((f) => ({
      id: f,
      label: t(`admin:quality.field.${f}` as TranslationKey),
      value: byField[f],
    }));
  return (
    <Card title={title} {...(info === undefined ? {} : { meta: info })}>
      <div data-testid="missing-field-bars">
        <HBarList label={title} rows={rows} threshold={threshold} />
      </div>
    </Card>
  );
}
