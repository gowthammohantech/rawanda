/**
 * Next steps copy mapping (CTZ-04). Every sentence the wallet shows for a step comes from a
 * fixed catalogue key chosen by the step kind — the wallet never writes its own advice and
 * never renders clinician free text. The seeded `messageKey` is used only when it is one of the
 * known `citizen:nextStep.<kind>.message` keys.
 */
import type { ApprovedInstruction, CareInstructionKind } from "@laif/domain";
import { facilityLabelKey } from "@laif/mock-data";
import type { IconName, TranslationKey, TranslationValues } from "@laif/ui-native";

type KindSpec = {
  icon: IconName;
  typeKey: TranslationKey;
  headingKey: TranslationKey;
  messageKey: TranslationKey;
  /** "What to bring" — only kinds that have an approved key. */
  bringKey: TranslationKey | null;
};

/** calendar = appointment, arrow = referral, clipboard = follow-up. */
export const KIND_SPECS: Record<CareInstructionKind, KindSpec> = {
  appointment: {
    icon: "calendar",
    typeKey: "citizen:nextSteps.type.appointment",
    headingKey: "citizen:nextSteps.heading.appointment",
    messageKey: "citizen:nextStep.appointment.message",
    bringKey: "citizen:nextStep.appointment.bring",
  },
  referral: {
    icon: "arrow",
    typeKey: "citizen:nextSteps.type.referral",
    headingKey: "citizen:nextSteps.heading.referral",
    messageKey: "citizen:nextStep.referral.message",
    bringKey: "citizen:nextStep.referral.bring",
  },
  follow_up: {
    icon: "clipboard",
    typeKey: "citizen:nextSteps.type.followUp",
    headingKey: "citizen:nextSteps.heading.followUp",
    messageKey: "citizen:nextStep.follow_up.message",
    bringKey: null,
  },
};

const KNOWN_MESSAGE_KEYS = new Set<string>(Object.values(KIND_SPECS).map((s) => s.messageKey));

/** The catalogue key of a step's instruction text (falls back to the kind's key). */
export function messageKeyOf(step: Pick<ApprovedInstruction, "kind" | "messageKey">) {
  return KNOWN_MESSAGE_KEYS.has(step.messageKey)
    ? (step.messageKey as TranslationKey)
    : KIND_SPECS[step.kind].messageKey;
}

export function facilityKeyOf(step: Pick<ApprovedInstruction, "facilityId">): TranslationKey {
  return facilityLabelKey(step.facilityId) as TranslationKey;
}

type Translate = (key: TranslationKey, values?: TranslationValues) => string;

/** Heading, instruction text and type label of a step, in the current language. */
export function stepTexts(t: Translate, step: ApprovedInstruction) {
  const spec = KIND_SPECS[step.kind];
  const facility = t(facilityKeyOf(step));
  return {
    facility,
    type: t(spec.typeKey),
    heading: t(spec.headingKey, { facility }),
    message: t(messageKeyOf(step), { facility }),
    bring: spec.bringKey === null ? null : t(spec.bringKey),
  };
}

/** Words the wallet must never use about timing (FRD §5 — no clinical overdue labelling). */
export const FORBIDDEN_TIMING_WORDS = /\b(overdue|missed|late|urgent)\b/iu;
