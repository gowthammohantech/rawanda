import { enResources, rwResources } from "@laif/i18n";
import { describe, expect, it } from "vitest";

import {
  catalogueKeys,
  METRIC_KEYS,
  metricDescriptionKey,
  metricLabelKey,
  PACKAGE,
} from "./index.ts";

function lookup(catalogue: object, dotted: string): unknown {
  let node: unknown = catalogue;
  for (const part of dotted.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

describe("@laif/analytics", () => {
  it("exports its package name", () => {
    expect(PACKAGE).toBe("@laif/analytics");
  });

  it("every metric key has EN + RW label and description (admin namespace)", () => {
    for (const res of [enResources, rwResources]) {
      for (const key of METRIC_KEYS) {
        for (const k of [metricLabelKey(key), metricDescriptionKey(key)]) {
          expect(typeof lookup(res.admin, k.replace(/^admin:/, "")), k).toBe("string");
        }
      }
      expect(lookup(res.common, "suppressed")).toMatch(/\{\{threshold\}\}/);
    }
    expect(lookup(enResources.common, "suppressed")).toBe("Suppressed (<{{threshold}})");
  });

  it("every METRIC_DEFINITIONS key has EN + RW text (ADM-02 catalogue)", () => {
    for (const res of [enResources, rwResources]) {
      for (const key of catalogueKeys()) {
        expect(typeof lookup(res.admin, key.replace(/^admin:/, "")), key).toBe("string");
      }
    }
  });
});
