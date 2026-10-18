/** High contrast (CTZ-08 task 4): switches every kit text / action / chip to the ≥ 7:1 token set. */
import { Toggle, useTx } from "@laif/ui-native";

export function ContrastToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTx();
  return (
    <Toggle
      label={t("citizen:accessibility.highContrast")}
      description={t("citizen:accessibility.highContrastHint")}
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      testID="contrast-toggle"
    />
  );
}
