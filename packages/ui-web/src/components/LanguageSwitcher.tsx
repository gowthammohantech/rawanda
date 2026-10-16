import { LANGUAGE_TAGS, useLanguage } from "@laif/i18n";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";

export type LanguageSwitcherProps = { className?: string };

/** EN / RW segmented control; persists via `useLanguage().setLanguage`; `aria-pressed`. */
export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const t = useTx();
  const { language, setLanguage, languages } = useLanguage();
  return (
    <div
      role="group"
      aria-label={t("common:language.label")}
      className={cx(
        "rounded-pill border-border-soft bg-surface inline-flex items-center gap-0.5 border p-0.5",
        className,
      )}
    >
      {languages.map((lng) => {
        const active = lng === language;
        return (
          <button
            key={lng}
            type="button"
            lang={LANGUAGE_TAGS[lng]}
            aria-pressed={active}
            onClick={() => {
              if (!active) void setLanguage(lng);
            }}
            className={cx(
              "target-min rounded-pill inline-flex items-center justify-center px-2.5 font-mono text-xs font-medium",
              active ? "bg-primary text-on-primary" : "text-muted hover:text-ink",
            )}
          >
            <span aria-hidden="true">{lng.toUpperCase()}</span>
            <span className="sr-only">{t(`common:languageName.${lng}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
