import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radii, shadows, spacing, withAlpha } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { IconButton } from "./IconButton.tsx";

export type SheetProps = {
  visible: boolean;
  /** Close request (backdrop, back button, close icon). Ignored while `dismissible` is false. */
  onClose: () => void;
  /** Translated title (announced as a header). */
  title: string;
  description?: string;
  children?: ReactNode;
  /** Pinned action row. */
  footer?: ReactNode;
  /** `false` while saving: backdrop / back / close do nothing. */
  dismissible?: boolean;
  testID?: string;
};

/** Bottom sheet on RN `Modal` (no animation library); base of the kit's sheets. */
export function Sheet({
  visible,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  testID,
}: SheetProps) {
  const close = () => {
    if (dismissible) onClose();
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* Tap-outside backdrop: hidden from screen readers (they use the labelled close
            button, Android back, or the iOS escape gesture). */}
        <Pressable accessible={false} aria-hidden onPress={close} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={["bottom"]} style={styles.sheet} testID={testID}>
          <View
            accessibilityViewIsModal
            aria-modal
            onAccessibilityEscape={close}
            style={styles.inner}
          >
            <View style={styles.head}>
              <View style={styles.titles}>
                <AppText variant="title" accessibilityRole="header">
                  {title}
                </AppText>
                {description === undefined ? null : <AppText color="muted">{description}</AppText>}
              </View>
              <IconButton
                icon="close"
                labelKey="common:actions.close"
                onPress={close}
                disabled={!dismissible}
              />
            </View>
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
            {footer === undefined ? null : <View style={styles.footer}>{footer}</View>}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: withAlpha(colors.ink, 0.4) },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    backgroundColor: colors.surface,
    ...shadows.overlay,
  },
  inner: { padding: spacing.lg, gap: spacing.md },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  titles: { flex: 1, gap: spacing.xs },
  body: { flexGrow: 0 },
  bodyContent: { gap: spacing.sm },
  footer: { gap: spacing.sm },
});
