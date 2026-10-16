import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { colors, spacing } from "../tokens.ts";
import { DemoBanner } from "./DemoBanner.tsx";
import { OfflineBanner } from "./OfflineBanner.tsx";

export type ScreenProps = {
  children?: ReactNode;
  /** Usually an `AppHeader`; rendered under the DemoBanner, above the offline strip. */
  header?: ReactNode;
  /** Shows the OfflineBanner ("Offline — changes are saved on this device"). */
  offline?: boolean;
  /** Already-formatted time of the last sync (offline strip). */
  lastSyncedLabel?: string;
  /** Pinned below the content (primary action bar). */
  footer?: ReactNode;
  /** `false` for screens that render their own list (FlatList) — no outer ScrollView. */
  scroll?: boolean;
  /** Wraps content in a KeyboardAvoidingView (forms). Default true. */
  keyboardAvoiding?: boolean;
  /** Safe-area edges (default all; tab screens usually pass `["top", "left", "right"]`). */
  edges?: readonly Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Screen frame: safe areas + the DemoBanner as the FIRST child (always; it cannot be turned
 * off) + optional header + OfflineBanner + scrolling, keyboard-avoiding content.
 */
export function Screen({
  children,
  header,
  offline = false,
  lastSyncedLabel,
  footer,
  scroll = true,
  keyboardAvoiding = true,
  edges = ["top", "right", "bottom", "left"],
  contentStyle,
  testID,
}: ScreenProps) {
  const content = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView edges={edges} style={styles.root} testID={testID ?? "screen"}>
      <DemoBanner />
      {header ?? null}
      {offline ? (
        <OfflineBanner {...(lastSyncedLabel === undefined ? {} : { lastSyncedLabel })} />
      ) : null}
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {content}
          {footer ?? null}
        </KeyboardAvoidingView>
      ) : (
        <>
          {content}
          {footer ?? null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
});
