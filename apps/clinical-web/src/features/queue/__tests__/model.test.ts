/** CLN-05 queue URL state, repository-filter mapping and Kigali week start. */
import { describe, expect, it } from "vitest";

import {
  parseQueueParams,
  patchQueueParams,
  startOfKigaliWeekIso,
  toRepositoryFilter,
} from "../model.ts";

const PERMITTED = ["fac-alpha-1", "fac-alpha-2"];
const parse = (query: string) => parseQueueParams(new URLSearchParams(query), PERMITTED);

describe("queue URL state", () => {
  it("defaults and per-field fallback for invalid values", () => {
    expect(parse("").filter).toEqual({
      tab: "pending",
      assignee: "any",
      sort: "flaggedAt_asc",
      page: 1,
    });
    expect(parse("tab=nope&assignee=all&sort=x&page=-2&q=").filter).toEqual(parse("").filter);
    expect(parse("tab=urgent&assignee=me&sort=patient_asc&page=3&q=%20Qua%20").filter).toEqual({
      tab: "urgent",
      assignee: "me",
      sort: "patient_asc",
      page: 3,
      q: "Qua",
    });
  });

  it("keeps a permitted facility and reports an out-of-scope one", () => {
    expect(parse("facility=fac-alpha-2")).toMatchObject({
      filter: { facilityId: "fac-alpha-2" },
      outOfScopeFacility: null,
    });
    const out = parse("facility=fac-beta-1");
    expect(out.filter.facilityId).toBeUndefined();
    expect(out.outOfScopeFacility).toBe("fac-beta-1");
  });

  it("patches omit defaults and reset paging unless only the page changes", () => {
    const base = new URLSearchParams("tab=all&page=2");
    expect(patchQueueParams(base, { page: 3 }).toString()).toBe("tab=all&page=3");
    expect(patchQueueParams(base, { sort: "dueAt_asc" }).toString()).toBe("tab=all&sort=dueAt_asc");
    expect(patchQueueParams(base, { tab: "pending" }).toString()).toBe("");
    expect(patchQueueParams(base, { q: "  " }).toString()).toBe("tab=all");
  });
});

describe("toRepositoryFilter", () => {
  const ctx = { facilityId: "fac-alpha-1", personaId: "persona-clin-alpha1" };
  it("maps assignee and q onto the shared list / count filter", () => {
    expect(toRepositoryFilter({ assignee: "any", q: "" }, ctx)).toEqual({
      facilityIds: ["fac-alpha-1"],
    });
    expect(toRepositoryFilter({ assignee: "me", q: "Qua" }, ctx)).toEqual({
      facilityIds: ["fac-alpha-1"],
      q: "Qua",
      assignedClinicianId: "persona-clin-alpha1",
    });
    expect(toRepositoryFilter({ assignee: "unassigned", q: "" }, ctx)).toEqual({
      facilityIds: ["fac-alpha-1"],
      assignedClinicianId: null,
    });
  });
});

describe("startOfKigaliWeekIso", () => {
  it("is Monday 00:00 Kigali (= Sunday 22:00 UTC)", () => {
    // 2026-10-14 is a Wednesday.
    expect(startOfKigaliWeekIso("2026-10-14T06:00:00.000Z")).toBe("2026-10-11T22:00:00.000Z");
    // Sunday 23:30 UTC is already Monday 01:30 in Kigali.
    expect(startOfKigaliWeekIso("2026-10-11T23:30:00.000Z")).toBe("2026-10-11T22:00:00.000Z");
    expect(startOfKigaliWeekIso("2026-10-11T21:59:00.000Z")).toBe("2026-10-04T22:00:00.000Z");
  });
});
