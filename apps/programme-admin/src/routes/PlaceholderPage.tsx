import { EmptyState, PageHeader, useTx, type TranslationKey } from "@laif/ui-web";

import { ScopeStrip } from "../app/ScopeStrip.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";

export type PlaceholderPageProps = {
  /** Page title key, e.g. `admin:nav.overview`. */
  titleKey: TranslationKey;
  /** Phase that delivers the real screen, e.g. `ADM-02`. */
  phase: string;
  /** Optional extra description key. */
  descriptionKey?: TranslationKey;
};

/** Placeholder for a route delivered by a later ADM phase ("Coming in ADM-0x"). */
export function PlaceholderPage({ titleKey, phase, descriptionKey }: PlaceholderPageProps) {
  const t = useTx();
  const title = t(titleKey);
  useDocumentTitle(title);
  return (
    <>
      <PageHeader title={title} subtitle={t("admin:appName")} />
      <ScopeStrip />
      <EmptyState
        icon="clock"
        title={t("admin:placeholder.comingSoon", { phase })}
        description={t(descriptionKey ?? "admin:placeholder.description")}
      />
    </>
  );
}
