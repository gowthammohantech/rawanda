/**
 * Scope confirmation (HWM-01 task 7): DISTRICT / FACILITY micro-labels with the fictional entities
 * (DEMO ENTITY pill), read-only from the persona's assignment; field supervisors pick one of their
 * assigned facilities (Continue disabled + inline hint until they do). The facility chosen here
 * becomes the session scope — later screens never read it from route params.
 */
import { roleLabelKey } from "@laif/auth-demo";
import { FACILITIES_REFERENCE } from "@laif/mock-data";
import {
  AppText,
  Button,
  Card,
  colors,
  MicroLabel,
  radii,
  RadioCardGroup,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { SHOW_TEST_HOOKS } from "../../config.ts";
import type { AppPersona } from "../../session/store.ts";
import { districtName, districtOf, facilityName } from "./labels.ts";

export type ScopeConfirmProps = {
  persona: AppPersona;
  /** Signs in; resolves when navigation has been decided. */
  onConfirm: (facilityId: string) => Promise<void>;
  /** Shows the developer / E2E "force out-of-scope facility" test hook (default: dev builds). */
  showTestHook?: boolean;
};

function DemoEntityPill() {
  const t = useTx();
  return (
    <View style={styles.pill}>
      <MicroLabel tone="warning">{t("worker:auth.scope.demoEntity")}</MicroLabel>
    </View>
  );
}

export function ScopeConfirm({
  persona,
  onConfirm,
  showTestHook = SHOW_TEST_HOOKS,
}: ScopeConfirmProps) {
  const t = useTx();
  const multiple = persona.facilityIds.length > 1;
  const [facilityId, setFacilityId] = useState<string | null>(
    multiple ? null : (persona.facilityIds[0] ?? null),
  );
  const [busy, setBusy] = useState(false);
  const district =
    facilityId === null ? districtOf(persona.facilityIds[0] ?? "") : districtOf(facilityId);
  const outside = FACILITIES_REFERENCE.find(
    (f) => !(persona.facilityIds as readonly string[]).includes(f.id),
  );

  const confirm = async (id: string) => {
    setBusy(true);
    try {
      await onConfirm(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="scope-confirm">
      <View style={styles.intro}>
        <AppText variant="display" accessibilityRole="header">
          {t("worker:auth.scope.title")}
        </AppText>
        <AppText color="muted">
          {persona.displayName} · {t(roleLabelKey(persona.role))}
        </AppText>
        <MicroLabel tone="warning">{t("worker:auth.demoNotice")}</MicroLabel>
      </View>
      <Card>
        <View style={styles.row}>
          <MicroLabel>{t("worker:auth.scope.district")}</MicroLabel>
          <AppText weight="semibold" testID="scope-district">
            {district === null ? "—" : districtName(district, t)}
          </AppText>
          <DemoEntityPill />
        </View>
        {multiple ? null : (
          <View style={[styles.row, styles.separator]}>
            <MicroLabel>{t("worker:auth.scope.facility")}</MicroLabel>
            <AppText weight="semibold" testID="scope-facility">
              {facilityId === null ? "—" : facilityName(facilityId, t)}
            </AppText>
            <DemoEntityPill />
            <AppText variant="caption" color="muted">
              {t("worker:auth.scope.readOnly")}
            </AppText>
          </View>
        )}
      </Card>
      {multiple ? (
        <View style={styles.choice}>
          <MicroLabel heading>{t("worker:auth.scope.facility")}</MicroLabel>
          <RadioCardGroup
            testID="scope-facility-choice"
            legend={t("worker:auth.scope.chooseFacility")}
            required
            value={facilityId}
            onChange={setFacilityId}
            options={persona.facilityIds.map((id) => ({
              value: id,
              label: facilityName(id, t),
              description: t("worker:auth.scope.demoEntity"),
              icon: "home" as const,
            }))}
          />
          {facilityId === null ? (
            <AppText
              variant="caption"
              weight="medium"
              colorValue={colors.warning}
              accessibilityLiveRegion="polite"
              testID="scope-facility-hint"
            >
              {t("worker:auth.scope.chooseFacilityHint")}
            </AppText>
          ) : null}
        </View>
      ) : null}
      <Button
        testID="scope-continue"
        fullWidth
        icon="arrow"
        iconPosition="end"
        loading={busy}
        disabled={facilityId === null || busy}
        onPress={() => {
          if (facilityId !== null) void confirm(facilityId);
        }}
      >
        {t("worker:auth.continue")}
      </Button>
      {showTestHook && outside !== undefined ? (
        <Button
          testID="scope-test-hook"
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={() => void confirm(outside.id)}
        >
          {t("worker:auth.scope.testHook")}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  intro: { gap: spacing.sm },
  row: { gap: spacing.xs, paddingVertical: spacing.sm },
  separator: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  choice: { gap: spacing.sm },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.warningSoft,
  },
});
