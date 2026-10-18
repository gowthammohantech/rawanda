/**
 * Settings → LANGUAGE (HWM-10 task 1): EN / RW segmented switcher + "Saved on this device". The
 * choice is the FND-04 language preference (device key/value storage, outside the demo
 * database): effective offline, before sign-in and kept by Reset demo. A change made here is
 * audited `worker.settings.language_changed` (phase `settings.language_changed`).
 */
import { useLanguage } from "@laif/i18n";
import { AppText, LanguageSwitcher, Section, useTx } from "@laif/ui-native";
import { useEffect, useRef } from "react";

import { useRepository } from "../../providers.tsx";

export function LanguageSection() {
  const t = useTx();
  const repo = useRepository();
  const { language } = useLanguage();
  const previous = useRef(language);

  useEffect(() => {
    const from = previous.current;
    if (from === language) return;
    previous.current = language;
    void repo
      .recordAuditEvent({
        action: "worker.settings.language_changed",
        changeSummary: { from, to: language },
      })
      .catch(() => undefined);
  }, [language, repo]);

  return (
    <Section title={t("worker:settings.language")} testID="settings-language">
      <LanguageSwitcher testID="settings-language-switcher" />
      <AppText variant="caption" color="muted" testID="settings-language-saved">
        {t("worker:settings.languageSaved")}
      </AppText>
    </Section>
  );
}
