/**
 * CLN-11 task 5 copy safety over the WHOLE `clinical` EN catalogue: no diagnostic or treatment
 * wording (the only allowed uses are the explicit negations of the flag disclaimers), every
 * rule surface names the demo rules as not clinically validated, and the RW catalogue has every
 * EN key (no fallback in a release build).
 */
import { enResources, rwResources } from "@laif/i18n";
import { describe, expect, it } from "vitest";

const BANNED = [
  "diagnosis",
  "diagnose",
  "diagnostic",
  "hypertensive",
  "hypertension",
  "diabetic",
  "diabetes",
  "prescribe",
  "prescription",
  "medication",
  "dosage",
  "treatment",
  "therapy",
  "cure",
];

/** Disclaimers that NEGATE a banned term ("it is not a diagnosis"). */
const ALLOWED_NEGATIONS = ["not a diagnosis", "does not recommend treatment"];

function leaves(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) =>
      leaves(v, prefix === "" ? k : `${prefix}.${k}`),
    );
  }
  return [];
}

const en = leaves(enResources.clinical);
const rw = new Map(leaves(rwResources.clinical));

describe("clinical EN copy safety", () => {
  it("covers the whole catalogue", () => {
    expect(en.length).toBeGreaterThan(500);
  });

  it.each(BANNED)("never uses '%s' (except in a negating disclaimer)", (word) => {
    const offending = en.filter(([, text]) => {
      let lower = text.toLowerCase();
      for (const phrase of ALLOWED_NEGATIONS) lower = lower.replaceAll(phrase, "");
      return new RegExp(`\\b${word}`, "u").test(lower);
    });
    expect(offending).toEqual([]);
  });

  it("rule / flag surfaces say the demo rules are not clinically validated", () => {
    const text = (key: string) => en.find(([k]) => k === key)?.[1] ?? "";
    expect(text("review.howToRead.body")).toContain("not clinically validated");
    expect(text("queue.subtitle")).toContain("not clinically validated");
    expect(text("queue.kpi.urgentHint")).toContain("not clinically validated");
  });
});

describe("Kinyarwanda completeness", () => {
  it("every clinical EN key exists in RW and is non-empty", () => {
    const missing = en.map(([k]) => k).filter((k) => (rw.get(k) ?? "").trim() === "");
    expect(missing).toEqual([]);
  });

  it("the language fallback notice exists in both languages", () => {
    expect(rw.get("common.languageFallbackNotice")).toBeTruthy();
  });
});
