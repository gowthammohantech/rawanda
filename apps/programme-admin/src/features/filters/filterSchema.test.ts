import { DISTRICT_IDS, FACILITY_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import {
  customRangeIssue,
  DEFAULT_FILTERS,
  filterSearchOf,
  parseAdminFilters,
  resolvePeriod,
  serializeAdminFilters,
} from "./filterSchema.ts";

const TODAY = "2026-10-14";

describe("AdminFilterSchema / parseAdminFilters", () => {
  it("defaults: 90 days, all scope, all types", () => {
    expect(parseAdminFilters("", TODAY)).toEqual({ filters: DEFAULT_FILTERS, issues: [] });
    expect(resolvePeriod(DEFAULT_FILTERS, TODAY)).toEqual({ from: "2026-07-17", to: TODAY });
    expect(serializeAdminFilters(DEFAULT_FILTERS)).toBe("");
  });

  it("parses every param and round-trips canonically", () => {
    const search = `?preset=custom&from=2026-09-01&to=2026-09-30&district=${DISTRICT_IDS.alpha}&facility=${FACILITY_IDS.alpha1}&type=bp`;
    const { filters, issues } = parseAdminFilters(search, TODAY);
    expect(issues).toEqual([]);
    expect(filters).toEqual({
      preset: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
      district: DISTRICT_IDS.alpha,
      facility: FACILITY_IDS.alpha1,
      type: "bp",
    });
    expect(serializeAdminFilters(filters)).toBe(search);
    expect(resolvePeriod(filters, TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("presets resolve against the demo-clock day", () => {
    expect(resolvePeriod({ ...DEFAULT_FILTERS, preset: "30d" }, TODAY)).toEqual({
      from: "2026-09-15",
      to: TODAY,
    });
    expect(resolvePeriod({ ...DEFAULT_FILTERS, preset: "ytd" }, TODAY)).toEqual({
      from: "2026-01-01",
      to: TODAY,
    });
  });

  it("invalid params fall back to defaults and are reported", () => {
    expect(parseAdminFilters("?preset=7y&type=lipids", TODAY)).toEqual({
      filters: DEFAULT_FILTERS,
      issues: ["invalidPreset", "invalidType"],
    });
    expect(parseAdminFilters("?preset=custom&from=2026-09-30&to=2026-09-01", TODAY)).toEqual({
      filters: DEFAULT_FILTERS,
      issues: ["rangeOrder"],
    });
    expect(parseAdminFilters("?preset=custom&from=2026-02-30&to=2026-03-01", TODAY).issues).toEqual(
      ["invalidDate"],
    );
    expect(parseAdminFilters("?preset=custom&from=2026-10-01", TODAY).issues).toEqual([
      "customRangeMissing",
    ]);
    expect(parseAdminFilters("?preset=custom&from=2026-10-01&to=2026-10-20", TODAY).issues).toEqual(
      ["futureDate"],
    );
    expect(parseAdminFilters("?preset=30d&from=2026-10-01", TODAY)).toEqual({
      filters: { ...DEFAULT_FILTERS, preset: "30d" },
      issues: ["customRangeMissing"],
    });
  });

  it("a facility must belong to the selected district", () => {
    const parsed = parseAdminFilters(
      `?district=${DISTRICT_IDS.beta}&facility=${FACILITY_IDS.alpha1}`,
      TODAY,
    );
    expect(parsed.issues).toEqual(["facilityDistrict"]);
    expect(parsed.filters.district).toBe(DISTRICT_IDS.beta);
    expect(parsed.filters.facility).toBeNull();
  });

  it("the span is at most 366 days (inclusive)", () => {
    expect(customRangeIssue("2025-10-14", "2026-10-14", TODAY)).toBeNull(); // 366 days
    expect(customRangeIssue("2025-10-13", "2026-10-14", TODAY)).toBe("rangeTooLong"); // 367
    expect(customRangeIssue("2026-10-14", "2026-10-14", TODAY)).toBeNull();
    expect(customRangeIssue("2026-10-02", "2026-10-01", TODAY)).toBe("rangeOrder");
    expect(customRangeIssue(null, "2026-10-01", TODAY)).toBe("customRangeMissing");
  });

  it("filterSearchOf keeps only the global filter params", () => {
    expect(filterSearchOf("?preset=30d&next=x&district=d&tab=audit")).toBe(
      "?preset=30d&district=d",
    );
    expect(filterSearchOf("?tab=audit")).toBe("");
  });
});
