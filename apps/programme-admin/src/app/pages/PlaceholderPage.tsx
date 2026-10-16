import { EmptyState, PageHeader, useTx, type TranslationKey } from "@laif/ui-web";

import { useDocumentTitle } from "./useDocumentTitle.ts";

export type PlaceholderPageProps = {
  /** Page title key, e.g. `admin:nav.overview`. */
  titleKey: TranslationKey;
  /** Phase that delivers the real screen, e.g. `ADM-02`. */
  phase: string;
};

/** Placeholder for a route delivered by a later ADM phase. */
export function PlaceholderPage({ titleKey, phase }: PlaceholderPageProps) {
  const t = useTx();
  const title = t(titleKey);
  useDocumentTitle(title);
  return (
    <>
      <PageHeader title={title} subtitle={t("admin:appName")} />
      <EmptyState
        icon="clock"
        title={t("admin:placeholder.comingSoon", { phase })}
        description={t("admin:placeholder.description")}
      />
    </>
  );
}
