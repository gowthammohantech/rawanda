/** All / Care team / Me chips with counts (CTZ-07 task 4). */
import { TabbedFilter, useTx } from "@laif/ui-native";

import type { AccessFilter } from "./copy.ts";

export type AccessHistoryFilterProps = {
  value: AccessFilter;
  counts: Record<AccessFilter, number>;
  onChange: (value: AccessFilter) => void;
};

export function AccessHistoryFilter({ value, counts, onChange }: AccessHistoryFilterProps) {
  const t = useTx();
  return (
    <TabbedFilter<AccessFilter>
      testID="access-filter"
      label={t("citizen:privacy.access.filter.label")}
      value={value}
      onChange={onChange}
      tabs={[
        { value: "all", label: t("citizen:privacy.access.filter.all"), count: counts.all },
        {
          value: "careTeam",
          label: t("citizen:privacy.access.filter.careTeam"),
          count: counts.careTeam,
        },
        { value: "me", label: t("citizen:privacy.access.filter.me"), count: counts.me },
      ]}
    />
  );
}
