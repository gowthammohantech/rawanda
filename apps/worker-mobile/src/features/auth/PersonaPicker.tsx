/**
 * Demo persona picker (HWM-01 task 6): one card per worker persona (initials, name, role
 * micro-label, facility, district, DEMO SIGN-IN pill) with radio semantics, the "not security"
 * callout and Continue. DEMO SIGN-IN — NOT AUTHENTICATION.
 */
import { roleLabelKey } from "@laif/auth-demo";
import {
  AppText,
  Button,
  colors,
  EmptyState,
  InfoCallout,
  initialsOf,
  MicroLabel,
  radii,
  spacing,
  touchTarget,
  a11yState,
  useTx,
} from "@laif/ui-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { AppPersona } from "../../session/store.ts";
import { districtNames, facilityName } from "./labels.ts";

export type PersonaPickerProps = {
  personas: readonly AppPersona[];
  onContinue: (personaId: string) => void;
  initialPersonaId?: string | null;
};

export function PersonaPicker({
  personas,
  onContinue,
  initialPersonaId = null,
}: PersonaPickerProps) {
  const t = useTx();
  const [selected, setSelected] = useState<string | null>(
    personas.some((p) => p.id === initialPersonaId) ? initialPersonaId : null,
  );

  if (personas.length === 0) {
    return (
      <EmptyState
        icon="people"
        title={t("worker:auth.empty.title")}
        description={t("worker:auth.empty.description")}
      />
    );
  }

  return (
    <View style={styles.root} testID="persona-picker">
      <View style={styles.intro}>
        <AppText variant="display" accessibilityRole="header">
          {t("worker:auth.title")}
        </AppText>
        <MicroLabel tone="warning" testID="demo-sign-in-notice">
          {t("worker:auth.demoNotice")}
        </MicroLabel>
      </View>
      <InfoCallout title={t("worker:auth.notSecurityTitle")} icon="shield">
        {`${t("worker:auth.notSecurity")} ${t("worker:auth.productionNote")}`}
      </InfoCallout>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("worker:auth.personaList")}
        style={styles.list}
      >
        {personas.map((persona) => {
          const checked = selected === persona.id;
          const role = t(roleLabelKey(persona.role));
          const facilities = persona.facilityIds.map((id) => facilityName(id, t)).join(", ");
          const districts = districtNames(persona.facilityIds, t).join(", ");
          return (
            <Pressable
              key={persona.id}
              testID={`persona-card-${persona.id}`}
              accessibilityRole="radio"
              accessibilityLabel={`${persona.displayName}, ${role}, ${facilities}, ${districts}. ${t("worker:auth.demoPill")}`}
              {...a11yState({ checked, selected: checked })}
              onPress={() => setSelected(persona.id)}
              style={[touchTarget, styles.card, checked ? styles.cardOn : null]}
            >
              <View style={styles.avatar}>
                <AppText weight="semibold" colorValue={colors.primaryDark}>
                  {initialsOf(persona.displayName)}
                </AppText>
              </View>
              <View style={styles.text}>
                <AppText weight="semibold">{persona.displayName}</AppText>
                <MicroLabel>{role}</MicroLabel>
                <AppText variant="caption" color="muted">
                  {facilities}
                </AppText>
                <AppText variant="caption" color="muted">
                  {districts}
                </AppText>
                <View style={styles.pill}>
                  <MicroLabel tone="warning">{t("worker:auth.demoPill")}</MicroLabel>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      {selected === null ? (
        <AppText variant="caption" color="muted" accessibilityLiveRegion="polite">
          {t("worker:auth.selectHint")}
        </AppText>
      ) : null}
      <Button
        testID="persona-continue"
        fullWidth
        icon="arrow"
        iconPosition="end"
        disabled={selected === null}
        onPress={() => {
          if (selected !== null) onContinue(selected);
        }}
      >
        {t("worker:auth.continue")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  intro: { gap: spacing.sm },
  list: { gap: spacing.md },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  cardOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1, gap: spacing.xxs },
  pill: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.warningSoft,
  },
});
