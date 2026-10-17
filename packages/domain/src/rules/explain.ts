/**
 * `explainFlag` (CLN-06): derives the per-input evidence view model of a review from the FROZEN
 * evidence snapshot (flag + inputs at flag time) and the demo ruleset that produced it. A view
 * model only — not a persisted contract. No thresholds here: statuses come from the snapshot's
 * reason codes, never from re-comparing numbers.
 *
 * - `TRIGGERED` — the input's demo rule produced a reason code.
 * - `WITHIN_DEMO_RANGE` — the input was evaluated (or passed the input check) and did not trigger.
 * - `MISSING` — the input is absent (or the fasting status is explicitly "not recorded").
 * - `NOT_EVALUATED` — present but the demo rules did not evaluate it (incomplete inputs, or a
 *   repeat reading that no demo rule looks at).
 *
 * Completeness: `ruleset.requiredInputs` plus — when a glucose value was recorded — the glucose
 * value, unit and fasting status the engine needs to evaluate it.
 */
import type { Screening } from "../entities/screening.ts";
import type { DemoRuleset, EvidenceSnapshot, ReasonCode } from "./types.ts";

export const EVIDENCE_INPUT_KEYS = [
  "systolic",
  "diastolic",
  "glucoseValue",
  "glucoseUnit",
  "glucoseContext",
  "repeatReading",
] as const;
export type EvidenceInputKey = (typeof EVIDENCE_INPUT_KEYS)[number];

export const EVIDENCE_STATUSES = [
  "TRIGGERED",
  "WITHIN_DEMO_RANGE",
  "MISSING",
  "NOT_EVALUATED",
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

/** Demo rule ids of the ruleset (`<version>/<id>`); descriptions are app i18n keys by id. */
export const DEMO_RULE_IDS = {
  systolic: "BP-1",
  diastolic: "BP-2",
  glucoseValue: "GLU-1",
  glucoseUnit: "GLU-2",
  glucoseContext: "GLU-3",
} as const satisfies Partial<Record<EvidenceInputKey, string>>;
export type DemoRuleId = (typeof DEMO_RULE_IDS)[keyof typeof DEMO_RULE_IDS];

export type EvidenceItem = {
  inputKey: EvidenceInputKey;
  value: number | string | null;
  unit: string | null;
  /** e.g. `demo-ruleset-2026.10-v1/BP-1`; null when no demo rule applies. */
  ruleRef: string | null;
  /** Rule description id (the app maps it to copy; never a numeric threshold claim). */
  ruleDescriptionKey: DemoRuleId | null;
  status: EvidenceStatus;
};

export type DataCompleteness = {
  required: EvidenceInputKey[];
  present: EvidenceInputKey[];
  missing: EvidenceInputKey[];
};

export type FlagExplanation = {
  rulesetVersion: string;
  items: EvidenceItem[];
  completeness: DataCompleteness;
};

const TRIGGER_REASON: Partial<Record<EvidenceInputKey, ReasonCode>> = {
  systolic: "DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD",
  diastolic: "DEMO_BP_DIASTOLIC_AT_OR_ABOVE_THRESHOLD",
  glucoseValue: "DEMO_GLUCOSE_AT_OR_ABOVE_THRESHOLD",
};

const MMHG = "mmHg";

export function explainFlag(
  snapshot: EvidenceSnapshot,
  screening: Pick<Screening, "observations"> | null,
  ruleset: Pick<DemoRuleset, "version" | "requiredInputs">,
): FlagExplanation {
  const { flag, inputs } = snapshot;
  const version = flag.rulesetVersion;
  const reasons = new Set<ReasonCode>(flag.reasonCodes);
  const ref = (key: keyof typeof DEMO_RULE_IDS) => `${version}/${DEMO_RULE_IDS[key]}`;

  const numeric = (
    key: "systolic" | "diastolic" | "glucoseValue",
    value: number | null,
    unit: string | null,
  ): EvidenceItem => {
    const reason = TRIGGER_REASON[key];
    const status: EvidenceStatus =
      value === null
        ? "MISSING"
        : !flag.evaluable
          ? "NOT_EVALUATED"
          : reason !== undefined && reasons.has(reason)
            ? "TRIGGERED"
            : "WITHIN_DEMO_RANGE";
    return {
      inputKey: key,
      value,
      unit,
      ruleRef: ref(key),
      ruleDescriptionKey: DEMO_RULE_IDS[key],
      status,
    };
  };

  const items: EvidenceItem[] = [
    numeric("systolic", inputs.systolic, MMHG),
    numeric("diastolic", inputs.diastolic, MMHG),
  ];

  const hasGlucose = inputs.glucoseValue !== null;
  if (hasGlucose) {
    const unitMissing = inputs.glucoseUnit === null;
    const contextMissing =
      inputs.glucoseContext === null || inputs.glucoseContext === "not_recorded";
    items.push(numeric("glucoseValue", inputs.glucoseValue, inputs.glucoseUnit));
    items.push({
      inputKey: "glucoseUnit",
      value: inputs.glucoseUnit,
      unit: null,
      ruleRef: ref("glucoseUnit"),
      ruleDescriptionKey: DEMO_RULE_IDS.glucoseUnit,
      status: unitMissing ? "MISSING" : "WITHIN_DEMO_RANGE",
    });
    items.push({
      inputKey: "glucoseContext",
      value: inputs.glucoseContext,
      unit: null,
      ruleRef: ref("glucoseContext"),
      ruleDescriptionKey: DEMO_RULE_IDS.glucoseContext,
      // The engine stops at a missing unit: a recorded context was then never looked at.
      status: contextMissing ? "MISSING" : unitMissing ? "NOT_EVALUATED" : "WITHIN_DEMO_RANGE",
    });
  }

  const observations = screening?.observations ?? [];
  const repeatSys = observations.find((o) => o.code === "SYSTOLIC_REPEAT");
  const repeatDia = observations.find((o) => o.code === "DIASTOLIC_REPEAT");
  if (repeatSys !== undefined || repeatDia !== undefined) {
    const part = (v: string | number | boolean | undefined) => (v === undefined ? "—" : String(v));
    items.push({
      inputKey: "repeatReading",
      value: `${part(repeatSys?.value)}/${part(repeatDia?.value)}`,
      unit: repeatSys?.unit ?? repeatDia?.unit ?? MMHG,
      ruleRef: null,
      ruleDescriptionKey: null,
      status: "NOT_EVALUATED",
    });
  }

  const required = new Set<EvidenceInputKey>(
    ruleset.requiredInputs.filter((k): k is EvidenceInputKey =>
      (EVIDENCE_INPUT_KEYS as readonly string[]).includes(k),
    ),
  );
  if (hasGlucose) {
    required.add("glucoseValue");
    required.add("glucoseUnit");
    required.add("glucoseContext");
  }
  const byKey = new Map(items.map((item) => [item.inputKey, item]));
  const requiredList = EVIDENCE_INPUT_KEYS.filter((k) => required.has(k));
  const isPresent = (k: EvidenceInputKey) => {
    const item = byKey.get(k);
    return item !== undefined && item.status !== "MISSING";
  };
  return {
    rulesetVersion: version,
    items,
    completeness: {
      required: requiredList,
      present: requiredList.filter(isPresent),
      missing: requiredList.filter((k) => !isPresent(k)),
    },
  };
}
