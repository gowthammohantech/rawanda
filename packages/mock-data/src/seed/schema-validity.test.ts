import { ENTITY_SCHEMAS, isNormalisedIsoUtc } from "@laif/contracts";
import { describe, expect, it } from "vitest";

import { SEED_WINDOW_DAYS } from "./builder.ts";
import { createSeed } from "./generate.ts";
import { COLLECTION_ENTITY_TYPES, SEED_COLLECTIONS } from "./types.ts";

const seed = createSeed();
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === "string") yield [path, value];
  else if (Array.isArray(value))
    for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}.${k}`);
}

describe("seed schema validity", () => {
  it.each(SEED_COLLECTIONS)("every %s record parses with its @laif/contracts schema", (name) => {
    const schema = ENTITY_SCHEMAS[COLLECTION_ENTITY_TYPES[name]];
    for (const record of seed[name]) {
      const result = schema.safeParse(record);
      expect(result.success, `${name} ${JSON.stringify(result.error?.issues)}`).toBe(true);
      expect(record).toMatchObject({ synthetic: true });
    }
  });

  it("parsing does not change any record (timestamps already normalised to …sssZ)", () => {
    for (const name of SEED_COLLECTIONS) {
      const schema = ENTITY_SCHEMAS[COLLECTION_ENTITY_TYPES[name]];
      for (const record of seed[name]) expect(schema.parse(record)).toEqual(record);
    }
  });

  it("keeps every timestamp normalised and inside the −60 … +14 day window", () => {
    const now = Date.parse(seed.meta.demoClockIso);
    const day = 86_400_000;
    for (const name of SEED_COLLECTIONS) {
      for (const [path, value] of strings(seed[name], name)) {
        if (!ISO_LIKE.test(value)) continue;
        expect(isNormalisedIsoUtc(value), path).toBe(true);
        const offset = (Date.parse(value) - now) / day;
        if (name === "rulesets") continue; // effectiveFrom is configuration
        expect(offset, path).toBeGreaterThanOrEqual(SEED_WINDOW_DAYS.min);
        expect(offset, path).toBeLessThanOrEqual(SEED_WINDOW_DAYS.max);
      }
    }
  });

  it("has unique IDs per collection", () => {
    for (const name of SEED_COLLECTIONS) {
      const ids = seed[name].map((r) => ("id" in r ? r.id : r.version));
      expect(new Set(ids).size, name).toBe(ids.length);
    }
  });

  it("labels the ruleset as not clinically validated", () => {
    expect(seed.rulesets[0]).toMatchObject({
      label: "DEMO_RULE_NOT_CLINICALLY_VALIDATED",
      approvedBy: null,
      synthetic: true,
    });
  });
});
