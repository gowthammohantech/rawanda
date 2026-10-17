/**
 * Settings › Language (CLN-02 task 6): EN / RW, persisted by the `@laif/i18n` preference store
 * (localStorage `laif.clinical.language`) — survives reload and demo reset (the reset clears the
 * DB, never the language preference). Available to everyone.
 */
import { useLanguage, type Language } from "@laif/i18n";
import { Card, RadioCardGroup, useToast, useTx } from "@laif/ui-web";

export function LanguageCard() {
  const t = useTx();
  const { toast } = useToast();
  const { language, setLanguage, languages } = useLanguage();

  const change = async (next: Language) => {
    if (next === language) return;
    await setLanguage(next);
    toast({ title: t("clinical:settings.language.savedNotice"), tone: "positive" });
  };

  return (
    <Card title={t("clinical:settings.language.title")}>
      <div className="space-y-4">
        <p className="text-muted text-sm">{t("clinical:settings.language.body")}</p>
        <RadioCardGroup<Language>
          legend={t("clinical:settings.language.legend")}
          name="clinical-language"
          value={language}
          onChange={(next) => void change(next)}
          options={languages.map((lng) => ({
            value: lng,
            label: <span lang={lng}>{t(`clinical:settings.language.${lng}`)}</span>,
          }))}
        />
      </div>
    </Card>
  );
}
