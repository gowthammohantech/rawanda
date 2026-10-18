/**
 * Language (ADM-09; Implementation_notes EN⇄RW P0): the shared `@laif/i18n` switcher. The choice
 * is persisted by `@laif/i18n` (its own localStorage key), so it survives reload and offline use;
 * a "saved" status confirms a change. The language never changes a numeric value.
 */
import { useLanguage } from "@laif/i18n";
import { Card, LanguageSwitcher, useTx } from "@laif/ui-web";
import { useState } from "react";

export function LanguageSetting() {
  const t = useTx();
  const { language } = useLanguage();
  const [initial] = useState(language);
  const changed = initial !== language;
  return (
    <Card as="section" title={t("admin:settings.language")}>
      <div data-testid="language-setting" className="flex flex-col gap-3">
        <p className="text-muted m-0 text-[13px]">{t("admin:settings.languageHint")}</p>
        <LanguageSwitcher className="self-start" />
        <p role="status" className="text-muted m-0 min-h-5 text-xs" data-testid="language-saved">
          {changed
            ? t("admin:settings.languageSaved", { language: t(`common:languageName.${language}`) })
            : ""}
        </p>
      </div>
    </Card>
  );
}
