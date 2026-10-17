/** Search within tasks (HWM-07 scope): labelled, search icon, clear button (≥ 44 pt). */
import { colors, controlStyle, Icon, IconButton, radii, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, TextInput, View } from "react-native";

export function TaskSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTx();
  return (
    <View style={styles.wrap}>
      <View style={styles.icon} importantForAccessibility="no-hide-descendants">
        <Icon name="search" size={18} color={colors.muted} />
      </View>
      <TextInput
        testID="task-search-input"
        value={value}
        onChangeText={onChange}
        placeholder={t("worker:tasks.search.placeholder")}
        placeholderTextColor={colors.subtle}
        accessibilityLabel={t("worker:tasks.search.label")}
        accessibilityHint={t("worker:tasks.search.hint")}
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
            labelKey="worker:tasks.search.clear"
            onPress={() => onChange("")}
            testID="task-search-clear"
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
