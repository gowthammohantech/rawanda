/** Soft-blue data note (ADM-02 task 10): a summary of the displayed figures, never advice. */
import { InfoCallout, useTx } from "@laif/ui-web";
import type { ReactNode } from "react";

export function DataNoteCallout({ children }: { children: ReactNode }) {
  const t = useTx();
  return (
    <InfoCallout title={t("admin:overview.dataNote.title")} tone="info">
      <p>{children}</p>
      <p className="text-muted mt-1 text-xs">{t("admin:overview.dataNote.disclaimer")}</p>
    </InfoCallout>
  );
}
