import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { colors, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export type KeyValueItem = { id: string; label: string; value: ReactNode };

export type KeyValueListProps = { items: readonly KeyValueItem[]; testID?: string };

/** Label / value rows (stacked on narrow phones). */
export function KeyValueList({ items, testID }: KeyValueListProps) {
  return (
    <View testID={testID}>
      {items.map((item, index) => (
        <View key={item.id} style={[styles.row, index > 0 ? styles.separator : null]}>
          <AppText variant="caption" color="muted">
            {item.label}
          </AppText>
          {typeof item.value === "string" || typeof item.value === "number" ? (
            <AppText>{item.value}</AppText>
          ) : (
            item.value
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xxs, paddingVertical: spacing.sm },
  separator: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
});
