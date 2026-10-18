/**
 * Settings → ABOUT (HWM-10 task 1): synthetic data notice, demo rule set version (stored
 * ruleset, never clinically approved), app / Expo SDK version, "Not for clinical use", and the
 * labelled local-encryption limitation (INDEX open question 1: Expo Go cannot encrypt the
 * SQLite file, so the demo never claims encryption).
 */
import { InfoCallout, KeyValueList, Section, useTx } from "@laif/ui-native";
import { useQuery } from "@tanstack/react-query";

import appConfig from "../../../app.json";
import { EXPO_SDK_VERSION } from "../../config.ts";
import { useRepository } from "../../providers.tsx";

export function AboutDemoSection() {
  const t = useTx();
  const repo = useRepository();
  const ruleset = useQuery({
    queryKey: ["settings", "ruleset"],
    queryFn: async () => (await repo.getActiveRuleset()).version,
  });
  return (
    <Section title={t("worker:settings.about")} testID="settings-about">
      <InfoCallout icon="info">{t("worker:settings.aboutText")}</InfoCallout>
      <KeyValueList
        testID="about-details"
        items={[
          {
            id: "data",
            label: t("worker:settings.syntheticData"),
            value: t("worker:settings.notClinical"),
          },
          {
            id: "ruleset",
            label: t("worker:settings.rulesetVersion"),
            value: ruleset.data ?? "—",
          },
          { id: "app", label: t("worker:settings.appVersion"), value: appConfig.expo.version },
          { id: "sdk", label: t("worker:settings.sdkVersion"), value: EXPO_SDK_VERSION },
        ]}
      />
      <InfoCallout
        icon="lock"
        title={t("worker:settings.encryptionTitle")}
        testID="encryption-note"
      >
        {t("worker:settings.encryption")}
      </InfoCallout>
    </Section>
  );
}
