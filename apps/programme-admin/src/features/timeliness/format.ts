/** Timeliness formatting (ADM-04 task 4): days to 1 decimal, unit always written out (ICU plural). */
import { formatDate, formatNumber, useLanguage } from "@laif/i18n";
import { useTx } from "@laif/ui-web";

export function useDaysFormat(): (days: number) => string {
  const t = useTx();
  const { language } = useLanguage();
  return (days) =>
    t("admin:timeliness.unit.days", {
      count: days,
      value: formatNumber(days, language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    });
}

export function useWeekLabel(): (weekStart: string) => string {
  const { language } = useLanguage();
  return (weekStart) => formatDate(`${weekStart}T12:00:00.000Z`, language);
}
