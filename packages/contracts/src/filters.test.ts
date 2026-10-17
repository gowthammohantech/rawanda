/** CLN-03 `PatientSearchSchema` (URL search params) and the `PatientSummary` row shape. */
import { describe, expect, it } from "vitest";

import { PatientSummarySchema } from "./entities.ts";
import { contractsErrorMap } from "./error-map.ts";
import { PATIENT_SEARCH_PAGE_SIZE, PatientSearchSchema } from "./filters.ts";
import { parseValidationMessage } from "./messages.ts";

const parse = (value: unknown) =>
  PatientSearchSchema.safeParse(value, { error: contractsErrorMap });

describe("PatientSearchSchema", () => {
  it("defaults page 1 / pageSize 20 and treats a blank q as no query", () => {
    expect(parse({}).data).toEqual({ page: 1, pageSize: PATIENT_SEARCH_PAGE_SIZE });
    expect(parse({ q: "   " }).data).toEqual({ page: 1, pageSize: 20 });
  });

  it("coerces the URL page and trims q", () => {
    expect(parse({ q: "  Quavox ", page: "3" }).data).toEqual({
      q: "Quavox",
      page: 3,
      pageSize: 20,
    });
  });

  it("rejects a 1-character query with validation:minLength {min: 2}", () => {
    const result = parse({ q: "a" });
    expect(result.success).toBe(false);
    const issue = result.error?.issues[0];
    expect(issue?.path).toEqual(["q"]);
    expect(parseValidationMessage(issue?.message ?? "")).toEqual({
      key: "minLength",
      params: { min: 2 },
    });
  });

  it("rejects a query over 60 characters, page 0 and any other page size", () => {
    expect(parse({ q: "x".repeat(61) }).success).toBe(false);
    expect(parse({ page: "0" }).success).toBe(false);
    expect(parse({ pageSize: 25 }).success).toBe(false);
  });
});

describe("PatientSummarySchema", () => {
  it("accepts a summary row without any patient-identifying extras", () => {
    const row = {
      id: "pat-1",
      syntheticIdentifier: "DEMO-P-0001",
      displayName: "Quavox Zelqoxe",
      ageYears: 29,
      ageEstimated: true,
      sexOptional: "female",
      facilityId: "fac-alpha-1",
      lastScreeningAt: "2026-10-13T08:00:00.000Z",
      openItems: 2,
    };
    expect(PatientSummarySchema.parse(row)).toEqual(row);
    expect(PatientSummarySchema.safeParse({ ...row, openItems: -1 }).success).toBe(false);
  });
});
