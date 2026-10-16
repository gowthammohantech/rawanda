import { EmptyState, PageHeader, useTx, type TranslationKey } from "@laif/ui-web";

import { useDocumentTitle } from "./useDocumentTitle.ts";

export type PlaceholderPageProps = {
  /** Page title key, e.g. `clinical:nav.queue`. */
  titleKey: TranslationKey;
  /** Phase that delivers the real screen, e.g. `CLN-05`. */
  phase: string;
};

/** Placeholder for a route delivered by a later CLN phase. */
export function PlaceholderPage({ titleKey, phase }: PlaceholderPageProps) {
  const t = useTx();
  const title = t(titleKey);
  useDocumentTitle(title);
  return (
    <>
      <PageHeader title={title} subtitle={t("clinical:appName")} />
      <EmptyState
        icon="clock"
        title={t("clinical:placeholder.comingSoon", { phase })}
        description={t("clinical:placeholder.description")}
      />
    </>
  );
}
