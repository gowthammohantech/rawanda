/** Reminder timing radio group (CTZ-05 task 8): the day before / the morning of (demo times). */
import type { ReminderTiming } from "@laif/domain";
import { RadioCardGroup, useTx, type RadioCardOption } from "@laif/ui-native";
import { View } from "react-native";

import { InlineError } from "../../components/InlineError.tsx";

export type TimingSelectorProps = {
  value: ReminderTiming | null;
  onChange: (timing: ReminderTiming) => void;
  /** Validation: a timing must be chosen when opting in (translated). */
  error?: string | null;
  disabled?: boolean;
};

export function TimingSelector({ value, onChange, error, disabled = false }: TimingSelectorProps) {
  const t = useTx();
  const options: RadioCardOption<ReminderTiming>[] = [
    {
      value: "day_before",
      label: t("citizen:reminders.timing.dayBefore"),
      description: t("citizen:reminders.timing.dayBeforeHint"),
      icon: "calendar",
      disabled,
    },
    {
      value: "morning_of",
      label: t("citizen:reminders.timing.morningOf"),
      description: t("citizen:reminders.timing.morningOfHint"),
      icon: "clock",
      disabled,
    },
  ];
  return (
    <View>
      <RadioCardGroup<ReminderTiming>
        legend={t("citizen:reminders.timing.legend")}
        options={options}
        value={value}
        onChange={onChange}
        required
        testID="timing-selector"
      />
      <InlineError message={error ?? null} testID="timing-error" />
    </View>
  );
}
