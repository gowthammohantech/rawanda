/** Search input (HWM-04 task 1): labelled, search icon, clear button (≥ 44 pt). */
import { colors, controlStyle, Icon, IconButton, radii, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, TextInput, View } from "react-native";

export type PatientSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export function PatientSearchBar({ value, onChange }: PatientSearchBarProps) {
  const t = useTx();
  return (
    <View style={styles.wrap}>
      <View style={styles.icon} importantForAccessibility="no-hide-descendants">
        <Icon name="search" size={18} color={colors.muted} />
      </View>
      <TextInput
        testID="patient-search-input"
        value={value}
        onChangeText={onChange}
        placeholder={t("worker:patients.searchPlaceholder")}
        placeholderTextColor={colors.subtle}
        accessibilityLabel={t("worker:patients.searchLabel")}
        accessibilityHint={t("worker:patients.searchHint")}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        allowFontScaling
        style={[controlStyle.input, styles.input]}
      />
      {value === "" ? null : (
        <View style={styles.clear}>
          <IconButton
            icon="close"
            labelKey="worker:patients.clearSearch"
            onPress={() => onChange("")}
            testID="patient-search-clear"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: "center" },
  icon: { position: "absolute", left: spacing.md, zIndex: 1 },
  input: { paddingLeft: spacing.xxxl, paddingRight: spacing.xxxl, borderRadius: radii.md },
  clear: { position: "absolute", right: 0 },
});
