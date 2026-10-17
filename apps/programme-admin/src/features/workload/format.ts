/** Workload formatting (ADM-05): minutes to 1 decimal with the unit, percentages, the index. */
import { formatNumber, useLanguage } from "@laif/i18n";
import { useTx } from "@laif/ui-web";

export function useMinutesFormat(): (minutes: number) => string {
  const t = useTx();
  const { language } = useLanguage();
  return (minutes) =>
    t("admin:workload.unit.minutes", {
      count: minutes,
      value: formatNumber(minutes, language, { maximumFractionDigits: 1 }),
    });
}

/** A rate in [0, 1] → "38%". */
export function usePercentFormat(): (rate: number) => string {
  const { language } = useLanguage();
  return (rate) => `${formatNumber(Math.round(rate * 100), language)}%`;
}

/** Index → "1.08×". */
export function useIndexFormat(): (index: number) => string {
  const { language } = useLanguage();
  return (index) =>
    `${formatNumber(index, language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
}
