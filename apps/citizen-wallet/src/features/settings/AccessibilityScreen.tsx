/**
 * More → Accessibility (CTZ-08 tasks 1–5): language (each in its own name), text size with a
 * live preview, high contrast, and the low-data statement. Reachable WITHOUT consent (consent-free
 * allow-list in the `(app)` guard) and before a persona is chosen (welcome footer → the
 * `(onboarding)/accessibility` route: device-only, nothing is written to a profile).
 *
 * States: loading = settings skeleton; server error = the change is reverted on this phone with an
 * inline error + Retry (same idempotency key); conflict = saved values reloaded + toast; success =
 * "Saved" toast. Offline is not an error: everything here works without internet.
 */
import {
  AppText,
  Button,
  Card,
  InfoCallout,
  LoadingState,
  MicroLabel,
  Screen,
  Section,
  spacing,
  useTx,
} from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { ConsentFreeHeader } from "../../components/ConsentFreeHeader.tsx";
import { InlineError } from "../../components/InlineError.tsx";
import { ContrastToggle } from "./ContrastToggle.tsx";
import { LanguagePicker } from "./LanguagePicker.tsx";
import { TextScalePicker } from "./TextScalePicker.tsx";
import { useAccessibilitySettings } from "./useAccessibilitySettings.ts";

export function AccessibilityScreen({ fallback = "/more" }: { fallback?: "/more" | "/welcome" }) {
  const t = useTx();
  const { values, signedIn, loading, status, change, retry } = useAccessibilitySettings();
  const saving = status === "saving";

  return (
    <Screen
      testID="accessibility-screen"
      edges={["top", "left", "right"]}
      header={<ConsentFreeHeader title={t("citizen:accessibility.title")} fallback={fallback} />}
    >
      <View style={styles.root}>
        <View style={styles.intro}>
          <MicroLabel>{t("citizen:accessibility.eyebrow")}</MicroLabel>
          <AppText variant="display" accessibilityRole="header">
            {t("citizen:accessibility.title")}
          </AppText>
          <AppText color="muted">{t("citizen:accessibility.intro")}</AppText>
        </View>

        {signedIn ? null : (
          <InfoCallout icon="info" testID="accessibility-device-only">
            {t("citizen:accessibility.deviceOnly")}
          </InfoCallout>
        )}

        {status === "error" ? (
          <View style={styles.error} testID="accessibility-save-error">
            <InlineError message={t("citizen:accessibility.saveError")} />
            <Button variant="secondary" icon="refresh" onPress={retry} testID="accessibility-retry">
              {t("citizen:accessibility.retry")}
            </Button>
          </View>
        ) : null}

        {loading ? (
          <LoadingState variant="skeleton" rows={3} label={t("citizen:accessibility.loading")} />
        ) : (
          <>
            <Card testID="accessibility-language">
              <LanguagePicker
                value={values.language}
                onChange={(language) => void change({ language })}
                disabled={saving}
              />
            </Card>
            <Card testID="accessibility-text-size">
              <TextScalePicker
                value={values.textScale}
                onChange={(textScale) => void change({ textScale })}
                disabled={saving}
              />
            </Card>
            <Card testID="accessibility-contrast">
              <ContrastToggle
                value={values.highContrast}
                onChange={(highContrast) => void change({ highContrast })}
                disabled={saving}
              />
            </Card>
          </>
        )}

        <Section title={t("citizen:accessibility.lowData.title")} testID="accessibility-low-data">
          <AppText>{t("citizen:accessibility.lowData.body")}</AppText>
          <AppText variant="caption" color="muted">
            {t("citizen:accessibility.audioLater")}
          </AppText>
        </Section>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  intro: { gap: spacing.xs },
  error: { gap: spacing.sm },
});
