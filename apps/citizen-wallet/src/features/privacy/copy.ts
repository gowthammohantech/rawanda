/**
 * Privacy / correction copy helpers (CTZ-07): request references, status chips and stepper
 * position, target labels and access-row wording. Staff are shown by ROLE and FACILITY only
 * (FRD §5) — never by name and never with clinician free text.
 */
import type { CitizenAccessEvent, CorrectionRequest } from "@laif/contracts";
import type { CorrectionRequestStatus, Language } from "@laif/domain";
import { formatDate } from "@laif/i18n";
import { facilityLabelKey } from "@laif/mock-data";
import type { CorrectionTarget } from "@laif/repositories/citizen";
import type { IconName, Tone, TranslationKey, useTx } from "@laif/ui-native";

import { resultKindKey } from "../health/copy.ts";
import { stepTexts } from "../next-steps/copy.ts";

type Tx = ReturnType<typeof useTx>;

/** Short, human reference of a request: `CR-` + the last 4 id characters. */
export function correctionRef(id: string): string {
  return `CR-${id
    .replace(/[^a-z0-9]/giu, "")
    .slice(-4)
    .toUpperCase()}`;
}

export const OPEN_STATUSES: ReadonlySet<CorrectionRequestStatus> = new Set([
  "submitted",
  "in_review",
]);

export const isOpenRequest = (r: Pick<CorrectionRequest, "status">) => OPEN_STATUSES.has(r.status);

export const STATUS_CHIPS: Record<
  CorrectionRequestStatus,
  { key: TranslationKey; tone: Tone; icon: IconName }
> = {
  submitted: { key: "citizen:correction.status.submitted", tone: "info", icon: "clock" },
  in_review: { key: "citizen:correction.status.in_review", tone: "info", icon: "people" },
  resolved_amended: {
    key: "citizen:correction.status.resolved_amended",
    tone: "positive",
    icon: "check",
  },
  resolved_no_change: {
    key: "citizen:correction.status.resolved_no_change",
    tone: "neutral",
    icon: "check",
  },
};

/** Stepper position: Submitted (0) → With care team (1) → Resolved (2). */
export function stepperIndexOf(status: CorrectionRequestStatus): number {
  switch (status) {
    case "submitted":
      return 0;
    case "in_review":
      return 1;
    default:
      return 2;
  }
}

/** Seeded staff outcome keys with approved citizen copy (else a generic "finished" line). */
export const KNOWN_RESOLUTION_KEYS: ReadonlySet<string> = new Set([
  "glucose_context_corrected",
  "reading_time_confirmed",
]);

export function resolutionKeyOf(key: string | null): TranslationKey {
  return key !== null && KNOWN_RESOLUTION_KEYS.has(key)
    ? (`citizen:correction.resolution.${key}` as TranslationKey)
    : "citizen:correction.resolution.unknown";
}

/** Plain-language label of a picker item / a request's subject. */
export function targetLabel(t: Tx, target: CorrectionTarget, language: Language): string {
  switch (target.targetType) {
    case "screening":
      return t("citizen:correction.target.result", {
        kind: t(resultKindKey(target.observation.readings)),
        date: formatDate(target.observation.measuredAt, language),
      });
    case "care_instruction": {
      const texts = stepTexts(t, target.instruction);
      return t("citizen:correction.target.step", { type: texts.type, heading: texts.heading });
    }
    case "patient":
      return t("citizen:correction.target.personal");
  }
}

/** Label of a request's subject from the loaded targets (generic when no longer visible). */
export function requestTargetLabel(
  t: Tx,
  request: Pick<CorrectionRequest, "targetType" | "targetId">,
  targets: readonly CorrectionTarget[] | undefined,
  language: Language,
): string {
  const target = targets?.find(
    (x) => x.targetType === request.targetType && x.targetId === request.targetId,
  );
  if (target) return targetLabel(t, target, language);
  if (request.targetType === "patient") return t("citizen:correction.target.personal");
  return t("citizen:correction.target.unknown");
}

// ── Access history ──────────────────────────────────────────────────────────

export const ACCESS_FILTERS = ["all", "careTeam", "me"] as const;
export type AccessFilter = (typeof ACCESS_FILTERS)[number];

export const isOwnEvent = (e: Pick<CitizenAccessEvent, "actorId">, personaId: string | null) =>
  personaId !== null && e.actorId === personaId;

export function matchesAccessFilter(
  e: Pick<CitizenAccessEvent, "actorId" | "actorRole">,
  filter: AccessFilter,
  personaId: string | null,
): boolean {
  if (filter === "all") return true;
  const own = isOwnEvent(e, personaId);
  return filter === "me" ? own : !own && e.actorRole !== "citizen";
}

export function accessCounts(
  events: readonly Pick<CitizenAccessEvent, "actorId" | "actorRole">[],
  personaId: string | null,
): Record<AccessFilter, number> {
  return {
    all: events.length,
    careTeam: events.filter((e) => matchesAccessFilter(e, "careTeam", personaId)).length,
    me: events.filter((e) => matchesAccessFilter(e, "me", personaId)).length,
  };
}

/** "Nurse reviewer (synthetic) · Kigali Demo Health Centre" / "You". */
export function actorText(
  t: Tx,
  event: Pick<CitizenAccessEvent, "actorId" | "actorRole" | "facilityId">,
  personaId: string | null,
): string {
  if (isOwnEvent(event, personaId)) return t("citizen:privacy.access.actor.you");
  if (event.actorRole === null) return t("citizen:privacy.access.actor.careTeam");
  const role = t(`domain:role.${event.actorRole}` as TranslationKey);
  if (event.facilityId === null) return `${role} · ${t("citizen:privacy.access.actor.careTeam")}`;
  return t("citizen:privacy.access.actor.staff", {
    role,
    facility: t(facilityLabelKey(event.facilityId) as TranslationKey),
  });
}

export const actionKeyOf = (action: CitizenAccessEvent["action"]): TranslationKey =>
  `citizen:privacy.access.action.${action}` as TranslationKey;

export const purposeKeyOf = (purpose: CitizenAccessEvent["purpose"]): TranslationKey =>
  `citizen:privacy.access.purpose.${purpose}` as TranslationKey;
