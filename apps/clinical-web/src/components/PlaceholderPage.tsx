import { EmptyState, useTx, type TranslationKey } from "@laif/ui-web";

import { PageHeader } from "./PageHeader.tsx";

export type PlaceholderPageProps = {
  /** Page title key, e.g. `clinical:nav.queue`. */
  titleKey: TranslationKey;
  /** Phase that delivers the real screen, e.g. `CLN-05`. */
  phase: string;
};

/** Placeholder for a route delivered by a later CLN phase ("Delivered in CLN-xx"). */
export function PlaceholderPage({ titleKey, phase }: PlaceholderPageProps) {
  const t = useTx();
  return (
    <>
      <PageHeader title={t(titleKey)} subtitle={t("clinical:appName")} />
      <EmptyState
        icon="clock"
        title={t("clinical:placeholder.comingSoon", { phase })}
        description={t("clinical:placeholder.description")}
      />
    </>
  );
}
