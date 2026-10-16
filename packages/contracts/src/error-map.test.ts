import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import * as contracts from "./index.ts";
import { LIMITS, NOW } from "./testing/fixtures.ts";

const { installContractsErrorMap, parseValidationMessage, safeParseToFieldErrors } = contracts;

/** Every exported schema plus every factory instantiated with deps. */
function allSchemas(): [string, z.ZodType][] {
  const exported: [string, z.ZodType][] = [];
  for (const [name, value] of Object.entries(contracts) as [string, unknown][]) {
    if (value instanceof z.ZodType) exported.push([name, value]);
  }
  return [
    ...exported,
    [
      "createScreeningInputSchema",
      contracts.createScreeningInputSchema({ limits: LIMITS, now: NOW }),
    ],
    [
      "createScreeningAmendmentInputSchema",
      contracts.createScreeningAmendmentInputSchema({ limits: LIMITS, now: NOW }),
    ],
    ["createReviewDecisionInputSchema", contracts.createReviewDecisionInputSchema({ now: NOW })],
    [
      "createReferralTransitionInputSchema",
      contracts.createReferralTransitionInputSchema({ now: NOW }),
    ],
    ["writeResultSchema", contracts.writeResultSchema(contracts.PatientSchema)],
    ["pageSchema", contracts.pageSchema(contracts.ReviewSchema)],
  ];
}

const JUNK: unknown[] = [
  {},
  null,
  undefined,
  "text",
  42,
  [],
  { kind: "nope", to: 7, action: [], field: null, synthetic: false, id: 5, version: -1 },
  { createdAt: "yesterday", dueAt: "2026-13-45", idempotencyKey: "abc", page: "x" },
];

describe("contracts error map", () => {
  it("Zod's English defaults are what we are replacing (sanity check before install)", () => {
    const result = z.object({ a: z.string() }).safeParse({});
    expect(result.error?.issues[0]?.message).not.toMatch(/^validation:/u);
  });

  describe("after installContractsErrorMap()", () => {
    beforeAll(() => {
      installContractsErrorMap();
    });

    it("finds a meaningful number of schemas to check", () => {
      expect(allSchemas().length).toBeGreaterThan(40);
    });

    it.each(allSchemas())(
      "%s: parsing {} yields only decodable validation keys",
      (_name, schema) => {
        const result = schema.safeParse({});
        for (const issue of result.error?.issues ?? []) {
          expect(issue.message).toMatch(/^validation:/u);
          expect(parseValidationMessage(issue.message), issue.message).not.toBeNull();
        }
      },
    );

    it.each(allSchemas())("%s: junk inputs never leak English", (_name, schema) => {
      for (const input of JUNK) {
        for (const issue of schema.safeParse(input).error?.issues ?? []) {
          expect(issue.message).toMatch(/^validation:/u);
          expect(parseValidationMessage(issue.message), issue.message).not.toBeNull();
        }
      }
    });

    it("maps built-in issues of ad-hoc schemas too", () => {
      const adHoc = z.strictObject({
        email: z.email(),
        n: z.number().multipleOf(2).max(10),
        s: z.string().min(3).max(5),
        list: z.array(z.string()).min(1),
        when: z.iso.datetime(),
        pick: z.enum(["a", "b"]),
        either: z.union([z.string(), z.number()]),
        rec: z.record(z.enum(["x"]), z.number()),
        custom: z.string().refine(() => false),
      });
      const inputs = [
        {},
        {
          email: "x",
          n: 3,
          s: "ab",
          list: [],
          when: "now",
          pick: "c",
          either: true,
          rec: { y: 1 },
          extra: 1,
        },
        { n: 12, s: "abcdef", custom: "" },
      ];
      for (const input of inputs) {
        const issues = adHoc.safeParse(input).error?.issues ?? [];
        expect(issues.length).toBeGreaterThan(0);
        for (const issue of issues) {
          expect(parseValidationMessage(issue.message), issue.message).not.toBeNull();
        }
      }
    });

    it("maps specific codes to specific keys", () => {
      const s = z.object({
        req: z.string(),
        int: z.number().int(),
        big: z.number().max(5),
        long: z.string().max(2),
        short: z.string().min(3),
        empty: z.string().min(1),
        uuid: z.uuid(),
        date: z.iso.date(),
      });
      const errors = safeParseToFieldErrors(s, {
        int: 1.5,
        big: 6,
        long: "abc",
        short: "a",
        empty: "",
        uuid: "x",
        date: "2026-02-30",
      });
      expect(errors).toEqual({
        req: { key: "required", params: {} },
        int: { key: "integerRequired", params: {} },
        big: { key: "numberOutOfRange", params: { max: 5 } },
        long: { key: "tooLong", params: { max: 2 } },
        short: { key: "tooShort", params: { min: 3 } },
        empty: { key: "required", params: {} },
        uuid: { key: "invalidIdentifier", params: {} },
        date: { key: "invalidDate", params: {} },
      });
    });
  });
});

describe("safeParseToFieldErrors", () => {
  it("works without the global map and keys errors by dotted path", () => {
    const s = z.object({ a: z.object({ b: z.array(z.number()) }) });
    expect(safeParseToFieldErrors(s, { a: { b: [1, "2"] } })).toEqual({
      "a.b.1": { key: "invalidType", params: {} },
    });
    expect(safeParseToFieldErrors(s, { a: { b: [] } })).toEqual({});
  });

  it("uses _root for object-level issues and falls back to `invalid` for foreign messages", () => {
    const s = z.string().refine(() => false, { error: "Plain English" });
    expect(safeParseToFieldErrors(s, "x")).toEqual({ _root: { key: "invalid", params: {} } });
  });
});
