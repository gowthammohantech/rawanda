import type { ConflictResolution } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { colors, radii, spacing, withAlpha } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { Button } from "./Button.tsx";
import { StatusChip } from "./StatusChip.tsx";

export type ConflictRow = {
  id: string;
  /** Translated field label. */
  label: string;
  yours: ReactNode;
  latest: ReactNode;
  /** Defaults to `yours !== latest` for primitives. Changed rows get an icon + "Changed". */
  changed?: boolean;
};

export type ConflictCardProps = {
  /** Field-by-field comparison: "Your version" vs "Latest version". */
  rows: readonly ConflictRow[];
  /** `ConflictDetails.changedBy` already resolved to a display name. */
  changedBy?: string;
  /** `ConflictDetails.changedAt` (UTC ISO) — shown in Kigali time. */
  changedAt?: string;
  title?: string;
  description?: string;
  onResolve: (resolution: ConflictResolution) => unknown;
  /** The resolution currently being applied (busy; the other is disabled). */
  resolving?: ConflictResolution | null;
  /** Restrict the offered actions (both by default). */
  resolutions?: readonly ConflictResolution[];
  testID?: string;
};

const DEFAULT_RESOLUTIONS: readonly ConflictResolution[] = ["reapply_on_latest", "keep_latest"];

function renderValue(value: ReactNode) {
  return typeof value === "string" || typeof value === "number" ? (
    <AppText>{value}</AppText>
  ) : (
    value
  );
}

/**
 * The native conflict UI (HWM-09 `CompareTable`/`VersionCompareTable`, CTZ `ConflictNotice`):
 * mine vs latest per field, changed rows marked by icon + text, and the two FND-02
 * resolutions `reapply_on_latest` / `keep_latest`.
 */
export function ConflictCard({
  rows,
  changedBy,
  changedAt,
  title,
  description,
  onResolve,
  resolving = null,
  resolutions = DEFAULT_RESOLUTIONS,
  testID,
}: ConflictCardProps) {
  const t = useTx();
  const { language } = useLanguage();
  const time = changedAt === undefined ? undefined : formatDateTime(changedAt, language);
  const isChanged = (row: ConflictRow) =>
    row.changed ??
    ((typeof row.yours === "string" || typeof row.yours === "number") && row.yours !== row.latest);
  const who = [
    changedBy === undefined ? null : t("common:conflict.changedBy", { name: changedBy }),
    time === undefined ? null : t("common:conflict.changedAt", { time }),
  ].filter((part): part is string => part !== null);

  return (
    <View testID={testID ?? "conflict-card"} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.iconWrap}>
          <Icon name="alert" size={18} color={colors.danger} />
        </View>
        <View style={styles.headText}>
          <AppText weight="semibold" accessibilityRole="header">
            {title ?? t("common:conflict.title")}
          </AppText>
          <AppText variant="caption" color="muted">
            {description ?? t("common:conflict.description")}
          </AppText>
        </View>
      </View>
      <StatusChip tone="danger">{t("domain:status.syncOp.conflict")}</StatusChip>
      {who.length === 0 ? null : (
        <AppText variant="caption" color="muted">
          {who.join(" · ")}
        </AppText>
      )}

      <View accessibilityRole="list">
        {rows.map((row) => {
          const changed = isChanged(row);
          return (
            <View
              key={row.id}
              testID={`conflict-row-${row.id}`}
              style={[styles.row, changed ? styles.rowChanged : null]}
            >
              <View style={styles.rowHead}>
                <AppText variant="caption" weight="semibold" color="muted" style={styles.flex}>
                  {row.label}
                </AppText>
                {changed ? (
                  <View style={styles.changed} testID={`conflict-changed-${row.id}`}>
                    <Icon name="alert" size={12} color={colors.danger} />
                    <AppText variant="micro" colorValue={colors.danger} dense>
                      {t("common:conflict.changed")}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <View style={styles.compare}>
                <View style={styles.flex}>
                  <AppText variant="micro" color="muted">
                    {t("common:conflict.yourVersion")}
                  </AppText>
                  {renderValue(row.yours)}
                </View>
                <View style={styles.flex}>
                  <AppText variant="micro" color="muted">
                    {t("common:conflict.latestVersion")}
                  </AppText>
                  {renderValue(row.latest)}
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.actions}>
        {resolutions.map((resolution) => (
          <Button
            key={resolution}
            variant={resolution === "keep_latest" ? "secondary" : "primary"}
            fullWidth
            loading={resolving === resolution}
            disabled={resolving !== null && resolving !== resolution}
            onPress={() => onResolve(resolution)}
          >
            {t(domainKey("conflictResolution", resolution))}
          </Button>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: withAlpha(colors.danger, 0.3),
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  head: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  headText: { flex: 1, gap: spacing.xxs },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerSoft,
  },
  row: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  rowChanged: { backgroundColor: withAlpha(colors.dangerSoft, 0.7) },
  rowHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  changed: { flexDirection: "row", alignItems: "center", gap: spacing.xxs },
  compare: { flexDirection: "row", gap: spacing.md },
  flex: { flex: 1 },
  actions: { gap: spacing.sm },
});
