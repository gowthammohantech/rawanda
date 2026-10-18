import { describe, expect, it } from "vitest";

import {
  EXPORT_FILE_NAME_PATTERN,
  ExportReasonSchema,
  ExportRecordInputSchema,
  ExportRequestSchema,
} from "./index.ts";
import { errorKeys } from "./testing/fixtures.ts";

const KEY = "3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c";

describe("ExportReasonSchema (ADM-07 reason step)", () => {
  const ok = { reasonCode: "district_meeting", reasonText: "", acknowledgeAggregateOnly: true };

  it("accepts a code with the acknowledgement; free text optional except for `other`", () => {
    expect(errorKeys(ExportReasonSchema, ok)).toEqual({});
    expect(
      errorKeys(ExportReasonSchema, {
        ...ok,
        reasonCode: "other",
        reasonText: "Quarterly NCD programme review pack",
      }),
    ).toEqual({});
  });

  it("requires a code, the acknowledgement and 10–300 characters for `other`", () => {
    expect(
      errorKeys(ExportReasonSchema, {
        reasonCode: undefined,
        reasonText: "",
        acknowledgeAggregateOnly: false,
      }),
    ).toEqual({ reasonCode: "required", acknowledgeAggregateOnly: "required" });
    expect(errorKeys(ExportReasonSchema, { ...ok, reasonCode: "other" })).toEqual({
      reasonText: "required",
    });
    expect(
      errorKeys(ExportReasonSchema, { ...ok, reasonCode: "other", reasonText: "short" }),
    ).toEqual({ reasonText: "tooShort" });
    expect(errorKeys(ExportReasonSchema, { ...ok, reasonText: "x".repeat(301) })).toEqual({
      reasonText: "tooLong",
    });
  });

  it("ExportRequestSchema wraps the reason with template, granularity and key", () => {
    expect(
      errorKeys(ExportRequestSchema, {
        idempotencyKey: KEY,
        template: "programme_summary",
        granularity: "facility",
        reason: ok,
      }),
    ).toEqual({});
    expect(
      errorKeys(ExportRequestSchema, {
        idempotencyKey: "nope",
        template: "programme_summary",
        granularity: "month",
        reason: ok,
      }),
    ).toEqual({ idempotencyKey: "invalidIdentifier", granularity: "invalidEnum" });
  });
});

describe("ExportRecordInputSchema ADM-07 extension", () => {
  const input = {
    idempotencyKey: KEY,
    reasonCode: "district_meeting",
    template: "programme_summary",
    granularity: "facility",
    scope: { districtIds: ["dist-alpha"], facilityIds: ["fac-alpha-1"] },
    filters: { preset: "90d" },
    rowCount: 12,
    suppressedCells: 2,
    sha256: "a".repeat(64),
  };

  it("accepts the optional export id, period, file name and CSV text", () => {
    expect(
      errorKeys(ExportRecordInputSchema, {
        ...input,
        exportId: "6f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7d",
        period: { from: "2026-07-17", to: "2026-10-14" },
        fileName: "laif-demo_programme_summary_dist-alpha_2026-07-17_2026-10-14_6f1c2a9e.csv",
        csvText: "\uFEFF# x\r\n",
        grantId: "grant-analyst-alpha",
      }),
    ).toEqual({});
    expect(errorKeys(ExportRecordInputSchema, { ...input, fileName: "../etc/passwd.csv" })).toEqual(
      { fileName: "invalidFormat" },
    );
  });

  it("file names follow laif-demo_<template>_<scope>_<from>_<to>_<id8>.csv", () => {
    expect(
      EXPORT_FILE_NAME_PATTERN.test(
        "laif-demo_quality_fac-alpha-1_2026-09-15_2026-10-14_0a1b2c3d.csv",
      ),
    ).toBe(true);
    expect(EXPORT_FILE_NAME_PATTERN.test("report.csv")).toBe(false);
  });
});
