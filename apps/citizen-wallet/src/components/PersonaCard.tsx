/**
 * Demo persona card (CTZ-02 task 3): synthetic name, relationship, state chip and the
 * "Demo persona — role switching is not real sign-in" label. Announced as one button with name,
 * relationship and state.
 */
import type { CitizenPersonaSummary } from "@laif/repositories/citizen";
import {
  AppText,
  Icon,
  MicroLabel,
  StatusChip,
  minTouchTarget,
  radii,
  spacing,
  useTx,
  type TranslationKey,
  type Tone,
  usePalette,
  type Palette,
} from "@laif/ui-native";
import { Pressable, StyleSheet, View } from "react-native";
import { useThemedStyles } from "../theme/useThemedStyles.ts";

type Tx = ReturnType<typeof useTx>;

/** Translated state chip of a persona (account first, then the linked patient's consent). */
export function personaState(p: CitizenPersonaSummary, t: Tx): { label: string; tone: Tone } {
  const key = (k: string) => t(`citizen:onboarding.persona.${k}` as TranslationKey);
  if (p.accountStatus === "locked") return { label: key("stateLocked"), tone: "danger" };
  if (p.accountStatus !== "active") return { label: key("stateNotVerified"), tone: "warning" };
  const consent = p.patients[0]?.consentState ?? "not_recorded";
  if (consent === "granted") return { label: key("stateConsentGiven"), tone: "positive" };
  if (consent === "withdrawn") return { label: key("stateConsentWithdrawn"), tone: "neutral" };
  return { label: key("stateNoConsent"), tone: "info" };
}

export function personaRelationship(p: CitizenPersonaSummary, t: Tx): string {
  const patient = p.patients[0];
  if (!patient) return t("citizen:onboarding.persona.relationshipNone");
  return patient.relationship === "self"
    ? t("citizen:onboarding.persona.relationshipSelf")
    : t("citizen:onboarding.persona.relationshipRepresentative", { name: patient.displayName });
}

export type PersonaCardProps = {
  persona: CitizenPersonaSummary;
  onPress: () => unknown;
  disabled?: boolean;
};

export function PersonaCard({ persona, onPress, disabled = false }: PersonaCardProps) {
  const palette = usePalette();
  const styles = useThemedStyles(makeStyles);
  const t = useTx();
  const state = personaState(persona, t);
  const relationship = personaRelationship(persona, t);
  return (
    <Pressable
      testID={`persona-card-${persona.personaId}`}
      accessibilityRole="button"
      accessibilityLabel={t("citizen:onboarding.persona.cardA11y", {
        name: persona.displayName,
        relationship,
        state: state.label,
      })}
      accessibilityHint={t("citizen:onboarding.persona.cardHint")}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => void onPress()}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <View style={styles.top}>
        <View style={styles.names}>
          <AppText variant="bodyLarge" weight="semibold" heading>
            {persona.displayName}
          </AppText>
          <AppText variant="body" color="muted">
            {relationship}
          </AppText>
        </View>
        <Icon name="chevron" color={palette.muted} size={20} />
      </View>
      <View style={styles.meta}>
        <StatusChip tone={state.tone}>{state.label}</StatusChip>
        {persona.citizenCode === null ? null : <MicroLabel>{persona.citizenCode}</MicroLabel>}
      </View>
      <AppText variant="caption" color="subtle">
        {t("citizen:onboarding.persona.disclaimer")}
      </AppText>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      minHeight: minTouchTarget,
      minWidth: minTouchTarget,
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.borderSoft,
      backgroundColor: c.surface,
    },
    pressed: { backgroundColor: c.primarySoft },
    top: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    names: { flex: 1, gap: spacing.xxs },
    meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  });
