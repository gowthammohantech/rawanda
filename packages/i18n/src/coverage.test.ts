import { VALIDATION_KEYS } from "@laif/contracts";
import {
  DOMAIN_INVARIANT_CODES,
  PAST_DUE_LABEL_KEY,
  REASON_CODES,
  REVIEW_DECISION_INPUT_KINDS,
  ROLES,
} from "@laif/domain";
import { describe, expect, it } from "vitest";

import { DOMAIN_KEY_GROUPS, domainKey, requiredCatalogueKeys } from "./domain-keys.ts";
import { SUPPORTED_LANGUAGES, type Language } from "./languages.ts";
import {
  NAMESPACES,
  NEEDS_REVIEW,
  resources,
  rwReviewFlags,
  TRANSLATION_REVIEW_FLAGS,
} from "./resources.ts";
import { createTestI18n } from "./testing.ts";

/** Direct lookup without fallback: `ns:dotted.key` → string | undefined. */
function lookup(lng: Language, fullKey: string): unknown {
  const [ns, key] = fullKey.split(":") as [string, string];
  let node: unknown = (resources[lng] as Record<string, unknown>)[ns];
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function expectTranslated(fullKey: string): void {
  for (const lng of SUPPORTED_LANGUAGES) {
    const value = lookup(lng, fullKey);
    expect(typeof value, `${lng} ${fullKey}`).toBe("string");
    expect((value as string).trim(), `${lng} ${fullKey}`).not.toBe("");
  }
}

describe("catalogue coverage (EN + RW)", () => {
  it("covers every VALIDATION_KEYS entry from @laif/contracts", () => {
    expect(VALIDATION_KEYS.length).toBeGreaterThan(0);
    for (const key of VALIDATION_KEYS) expectTranslated(`validation:${key}`);
    for (const variant of ["between", "min", "max"]) {
      expectTranslated(`validation:numberOutOfRange_${variant}`);
    }
  });

  it("covers every rules-engine reason code, invariant code and the past-due label", () => {
    for (const code of REASON_CODES) expectTranslated(`domain:reason.${code}`);
    for (const code of DOMAIN_INVARIANT_CODES) expectTranslated(`domain:invariant.${code}`);
    expectTranslated(PAST_DUE_LABEL_KEY);
    expect(lookup("en", PAST_DUE_LABEL_KEY)).toBe("Past due date (demo timing)");
  });

  it("covers every mapped FND-02 enum value", () => {
    for (const [group, values] of Object.entries(DOMAIN_KEY_GROUPS)) {
      for (const value of values) expectTranslated(`domain:${group}.${value}`);
    }
    expect(domainKey("decision", "dismiss")).toBe("domain:decision.dismiss");
    for (const kind of REVIEW_DECISION_INPUT_KINDS) expectTranslated(`domain:decision.${kind}`);
    for (const role of ROLES) expectTranslated(`domain:role.${role}`);
  });

  it("requiredCatalogueKeys() lists exactly the keys above", () => {
    const keys = requiredCatalogueKeys();
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expectTranslated(key);
  });

  it("renders domain keys in RW through i18next without fallback", () => {
    const rw = createTestI18n("rw");
    expect(rw.t("domain:status.review.pending")).toBe("Birategereje");
    expect(rw.t(PAST_DUE_LABEL_KEY)).toBe("Itariki yarenze (igihe cy'igerageza)");
  });

  it("seeds the common/demo/shell keys and app namespaces", () => {
    for (const key of [
      "save",
      "cancel",
      "confirm",
      "retry",
      "back",
      "next",
      "search",
      "filter",
      "reset",
      "close",
    ]) {
      expectTranslated(`common:actions.${key}`);
    }
    for (const state of [
      "initial",
      "loading",
      "loaded",
      "empty",
      "validationError",
      "serverError",
      "error",
      "offline",
      "permissionDenied",
      "conflict",
      "success",
    ]) {
      expectTranslated(`common:state.${state}`);
    }
    expect(lookup("en", "common:languageName.en")).toBe("English");
    expect(lookup("en", "common:languageName.rw")).toBe("Ikinyarwanda");
    for (let n = 1; n <= 12; n++) {
      expectTranslated(`demo:scenario.SCN-${String(n).padStart(2, "0")}.title`);
    }
    for (const key of [
      "banner",
      "syntheticData",
      "resetDemo",
      "resetConfirm",
      "demoRoleSwitcher",
      "notForClinicalUse",
      "ruleDisclaimer",
    ]) {
      expectTranslated(`demo:${key}`);
    }
    expect(lookup("en", "demo:ruleDisclaimer")).toContain("DEMO_RULE_NOT_CLINICALLY_VALIDATED");
    expectTranslated("shell:skipToContent");
    expectTranslated("shell:search.placeholder");
    for (const ns of ["clinical", "worker", "admin", "citizen"]) expectTranslated(`${ns}:appName`);
    expect(Object.keys(resources.en)).toEqual([...NAMESPACES]);
    expect(Object.keys(resources.rw)).toEqual([...NAMESPACES]);
  });
});

describe("rw/_review.json", () => {
  it("only references existing RW keys with an allowed flag", () => {
    for (const [fullKey, flag] of Object.entries(rwReviewFlags)) {
      expect(typeof lookup("rw", fullKey), fullKey).toBe("string");
      expect(TRANSLATION_REVIEW_FLAGS as readonly string[], fullKey).toContain(flag);
    }
  });

  it("flags domain, validation and clinical copy as needing clinical/linguistic review", () => {
    for (const key of requiredCatalogueKeys()) {
      expect(rwReviewFlags[key], key).toBe(NEEDS_REVIEW);
    }
    for (const [fullKey, flag] of Object.entries(rwReviewFlags)) {
      if (/^(domain|validation|clinical):/.test(fullKey)) expect(flag, fullKey).toBe(NEEDS_REVIEW);
    }
  });
});
