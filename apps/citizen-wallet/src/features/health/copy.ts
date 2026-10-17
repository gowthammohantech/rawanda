/**
 * Plain-language copy mapping for My health (CTZ-03). The chip and the "what this means"
 * sentence are keyed ONLY by the citizen result label — never by flag reasons, rule codes or
 * clinician free text (none of which reach the wallet).
 */
import type { CitizenReadings, CitizenResultLabel, GlucoseContext, PersonaId } from "@laif/domain";
import { DEMO_PERSONAS } from "@laif/mock-data";
import type { IconName, Tone, TranslationKey } from "@laif/ui-native";

export type ChipSpec = { key: TranslationKey; tone: Tone; icon: IconName };

/** `FOLLOW-UP AGREED` (warning, calendar), `NO ACTION NEEDED` (positive, check),
 * `REVIEWED` (neutral, check — a dismissed flag is never shown as a problem). */
export const RESULT_CHIPS: Record<CitizenResultLabel, ChipSpec> = {
  followUpAgreed: { key: "citizen:health.chip.followUpAgreed", tone: "warning", icon: "calendar" },
  noActionNeeded: { key: "citizen:health.chip.noActionNeeded", tone: "positive", icon: "check" },
  reviewedNoActionNeeded: { key: "citizen:health.chip.reviewed", tone: "neutral", icon: "check" },
};

export const RESULT_MEANING: Record<CitizenResultLabel, TranslationKey> = {
  followUpAgreed: "citizen:health.meaning.followUpAgreed",
  noActionNeeded: "citizen:health.meaning.noAction",
  reviewedNoActionNeeded: "citizen:health.meaning.noAction",
};

export const GLUCOSE_CONTEXT_KEYS: Record<GlucoseContext, TranslationKey> = {
  fasting: "citizen:health.context.fasting",
  non_fasting: "citizen:health.context.nonFasting",
  not_recorded: "citizen:health.context.notRecorded",
};

export function hasBloodPressure(r: CitizenReadings): boolean {
  return r.systolic !== null && r.diastolic !== null;
}

export function hasGlucose(r: CitizenReadings): boolean {
  return r.glucoseValue !== null;
}

/** "Blood pressure and glucose check" / "Blood pressure check" / "Blood glucose check". */
export function resultKindKey(r: CitizenReadings): TranslationKey {
  const bp = hasBloodPressure(r);
  const glucose = hasGlucose(r);
  if (bp && glucose) return "citizen:health.kind.bpAndGlucose";
  if (bp) return "citizen:health.kind.bloodPressure";
  if (glucose) return "citizen:health.kind.glucose";
  return "citizen:health.kind.check";
}

const PERSONAS = new Map(DEMO_PERSONAS.map((p) => [p.id as string, p]));

/** Responsible professional (demo persona reference data — synthetic names). */
export function reviewerOf(id: PersonaId | null): { name: string; roleKey: TranslationKey } | null {
  if (id === null) return null;
  const persona = PERSONAS.get(id);
  if (persona === undefined) return null;
  return { name: persona.displayName, roleKey: `domain:role.${persona.role}` as TranslationKey };
}

/** First word of a display name (the greeting uses the signed-in persona's first name). */
export function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/u)[0] ?? "";
}
