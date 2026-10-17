/**
 * "Reviewed by … · 12 Oct 2026", "Agreed by …", "Updated by … · … · Reason: …" (CTZ-06; PRD
 * "trust data provenance"). Names come from the synthetic demo persona reference data; the
 * reason is only ever a catalogue KEY (`citizen:timeline.reason.<key>`) — clinician free text
 * never reaches the wallet. Dates in Africa/Kigali via `@laif/i18n`.
 */
import { formatDate, useLanguage } from "@laif/i18n";
import { AppText, useTx, type TranslationKey } from "@laif/ui-native";

import { reviewerOf } from "../health/copy.ts";
import type { TimelineProvenance } from "./buildCitizenTimeline.ts";

/** Amendment reason keys with approved citizen copy (else the generic "corrected" text). */
export const KNOWN_REASON_KEYS: ReadonlySet<string> = new Set(["glucose_context_corrected"]);

export function reasonKeyOf(reasonKey: string | null): TranslationKey {
  return reasonKey !== null && KNOWN_REASON_KEYS.has(reasonKey)
    ? (`citizen:timeline.reason.${reasonKey}` as TranslationKey)
    : "citizen:timeline.reason.unknown";
}

type Tx = ReturnType<typeof useTx>;

export function provenanceText(
  t: Tx,
  provenance: TimelineProvenance,
  language: Parameters<typeof formatDate>[1],
): string {
  const name = reviewerOf(provenance.personaId)?.name ?? t("citizen:timeline.provenance.careTeam");
  const date = formatDate(provenance.at, language);
  switch (provenance.kind) {
    case "reviewed":
      return t("citizen:timeline.provenance.reviewed", { name, date });
    case "approved":
      return t("citizen:timeline.provenance.approved", { name, date });
    case "updated":
      if (provenance.reasonKey === null) {
        return t("citizen:timeline.provenance.updated", { name, date });
      }
      return t("citizen:timeline.provenance.updatedWithReason", {
        name,
        date,
        reason: t(reasonKeyOf(provenance.reasonKey)),
      });
  }
}

export function ProvenanceLine({
  provenance,
  testID,
}: {
  provenance: TimelineProvenance;
  testID?: string;
}) {
  const t = useTx();
  const { language } = useLanguage();
  return (
    <AppText variant="caption" color="subtle" testID={testID ?? "timeline-provenance"}>
      {provenanceText(t, provenance, language)}
    </AppText>
  );
}
