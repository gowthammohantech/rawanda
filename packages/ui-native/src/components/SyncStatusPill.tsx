import type { EntitySyncState } from "@laif/domain";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { announce } from "../a11y.ts";
import { useTx, type TranslationKey } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";
import { radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { TONE_COLORS, type Tone } from "./tone.ts";

/** The five visual sync states (FND-10 §6). */
export const SYNC_PILL_STATES = [
  "saved_locally",
  "syncing",
  "synced",
  "conflict",
  "failed",
] as const;
export type SyncPillState = (typeof SYNC_PILL_STATES)[number];

/**
 * Input: the FND-02 `deriveSyncState(...)` result (the op-status mapping lives there), or
 * `failed` for an op that is in `retryable_failure` and should be shown as such (Sync centre).
 */
export type SyncStatusInput = EntitySyncState | "failed";

export type SyncPillVisual = {
  state: SyncPillState;
  tone: Tone;
  icon: IconName;
  labelKey: TranslationKey;
};

/**
 * Entity sync state → pill visual. `rejected` → failed "Not accepted"; `blocked` (device
 * revoked) → failed "Kept on device — device revoked"; `failed` → "Not sent — will retry".
 */
export function syncPillVisual(input: SyncStatusInput): SyncPillVisual {
  switch (input) {
    case "saved_locally":
      return {
        state: "saved_locally",
        tone: "info",
        icon: "clock",
        labelKey: "common:sync.savedOnDevice",
      };
    case "syncing":
      return { state: "syncing", tone: "info", icon: "sync", labelKey: "common:sync.syncing" };
    case "synced":
      return { state: "synced", tone: "positive", icon: "check", labelKey: "common:sync.synced" };
    case "conflict":
      return { state: "conflict", tone: "danger", icon: "alert", labelKey: "common:sync.conflict" };
    case "rejected":
      return {
        state: "failed",
        tone: "danger",
        icon: "octagon-alert",
        labelKey: "common:sync.notAccepted",
      };
    case "blocked":
      return {
        state: "failed",
        tone: "warning",
        icon: "lock",
        labelKey: "common:sync.keptOnDeviceRevoked",
      };
    case "failed":
      return {
        state: "failed",
        tone: "warning",
        icon: "refresh",
        labelKey: "common:sync.failedWillRetry",
      };
  }
}

export type SyncStatusPillProps = {
  state: SyncStatusInput;
  /** Extra translated note (e.g. "Next try 10:05"); shown after the label. */
  note?: string;
  /** Announce state changes to VoiceOver (TalkBack reads the polite live region). */
  announceChanges?: boolean;
  testID?: string;
};

/** Icon + text sync indicator (never colour-only); polite live region. */
export function SyncStatusPill({
  state,
  note,
  announceChanges = false,
  testID,
}: SyncStatusPillProps) {
  const t = useTx();
  const visual = syncPillVisual(state);
  const palette = TONE_COLORS[visual.tone];
  const text = t(visual.labelKey);
  const full = note === undefined ? text : `${text} · ${note}`;
  const previous = useRef(full);
  useEffect(() => {
    if (announceChanges && previous.current !== full) announce(full);
    previous.current = full;
  }, [announceChanges, full]);
  return (
    <View
      testID={testID ?? "sync-status-pill"}
      accessible
      accessibilityRole="text"
      accessibilityLabel={t("common:sync.statusLabel", { status: full })}
      accessibilityLiveRegion="polite"
      aria-live="polite"
      style={[styles.pill, { backgroundColor: palette.bg, borderColor: palette.border }]}
    >
      <Icon
        name={visual.icon}
        size={13}
        strokeWidth={2.2}
        color={palette.fg}
        testID={`sync-icon-${visual.icon}`}
      />
      <AppText variant="micro" dense colorValue={palette.fg} numberOfLines={2}>
        {full}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    maxWidth: "100%",
  },
});
