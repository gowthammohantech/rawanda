import { describe, expect, it } from "vitest";

import { REAL_NAME_DENYLIST } from "./names.ts";
import { FACILITIES_REFERENCE } from "./reference/facilities.ts";
import { FACILITY_CONTACTS } from "./reference/facility-contacts.ts";
import { DISTRICTS_REFERENCE } from "./reference/districts.ts";
import { SCENARIO_IDS, applyScenario } from "./scenarios/registry.ts";
import { createSeed } from "./seed/generate.ts";

const NIDA_LIKE = /(?<!\d)\d{16}(?!\d)/;
const RW_PHONE = /\+?250\s?7\d{2}/;

function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === "string") yield [path, value];
  else if (Array.isArray(value))
    for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      yield [`${path}.<key>`, k];
      yield* strings(v, `${path}.${k}`);
    }
}

describe("privacy: synthetic data only", () => {
  const seed = createSeed();
  const datasets = [seed, ...SCENARIO_IDS.map((id) => applyScenario(seed, id))];

  it("contains no 16-digit NIDA-like numbers or +2507… phone numbers in any string", () => {
    const hits: string[] = [];
    for (const data of datasets) {
      for (const [path, value] of strings(data, "seed")) {
        if (NIDA_LIKE.test(value) || RW_PHONE.test(value)) hits.push(`${path}: ${value}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("detects the patterns it guards against", () => {
    expect(NIDA_LIKE.test("1199080012345678")).toBe(true);
    expect(RW_PHONE.test("+250788123456")).toBe(true);
    expect(RW_PHONE.test("250 788123456")).toBe(true);
  });

  it("uses DEMO-P-#### synthetic identifiers and invented names", () => {
    const names = [
      ...seed.patients.map((p) => p.displayName),
      ...seed.personas.map((p) => p.displayName),
    ];
    for (const name of names) {
      for (const part of name.split(/\s+/)) {
        expect(REAL_NAME_DENYLIST.map((n) => n.toLowerCase())).not.toContain(part.toLowerCase());
      }
    }
    expect(new Set(seed.patients.map((p) => p.displayName)).size).toBe(48);
    seed.patients.forEach((p, i) =>
      expect(p.syntheticIdentifier).toBe(`DEMO-P-${String(i + 1).padStart(4, "0")}`),
    );
  });

  it("labels every facility and district as Demo (Alpha / Beta)", () => {
    for (const ref of [...FACILITIES_REFERENCE, ...DISTRICTS_REFERENCE]) {
      expect(ref.name).toMatch(/^Demo .*(Alpha|Beta)/);
    }
  });

  it("CTZ-04: facility contact cards are synthetic, unallocated numbers for every facility", () => {
    expect(FACILITY_CONTACTS.map((c) => c.facilityId).sort()).toEqual(
      FACILITIES_REFERENCE.map((f) => f.id).sort(),
    );
    for (const contact of FACILITY_CONTACTS) {
      expect(contact.phone).toMatch(/^\+250700000\d{3}$/u);
      expect(contact.phoneDisplay.replace(/\s/gu, "")).toBe(contact.phone);
      expect(contact.address).toMatch(/Demo .*\(synthetic\)$/u);
      expect(contact.synthetic).toBe(true);
    }
  });

  it("marks every record synthetic", () => {
    for (const [name, rows] of Object.entries(seed)) {
      if (name === "meta") continue;
      for (const row of rows as Array<{ synthetic: unknown }>) expect(row.synthetic).toBe(true);
    }
    expect(seed.meta.generatedFor).toBe("SYNTHETIC DEMONSTRATION DATA — NOT FOR CLINICAL USE");
  });
});
