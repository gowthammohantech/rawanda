import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { spacing } from "../tokens.ts";
import { MicroLabel } from "./MicroLabel.tsx";

export type SectionProps = {
  /** Translated section title, rendered as a mono micro-label heading. */
  title: string;
  /** Right-aligned action (e.g. a ghost Button "See all"). */
  action?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Section({ title, action, children, style, testID }: SectionProps) {
  return (
    <View testID={testID} style={[styles.section, style]}>
      <View style={styles.head}>
        <MicroLabel heading>{title}</MicroLabel>
        {action ?? null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
});
