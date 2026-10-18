/**
 * Badge == rows invariant of the care-team task tabs (CLN-09), as pure functions over the seeded
 * Alpha-1 follow-ups: `tabCounts` (the badge) equals `rowsForTab(...).length` (what the tab
 * renders) for every tab. Regression guard for the CLN-10 report "Awaiting confirmation badge 1
 * vs 4 rows": the model was consistent; the e2e counted the previous tab's still-mounted table
 * during the router transition (fixed in `e2e/task-confirmation.spec.ts` by scoping to the panel).
 */
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createTestClinicalRepo } from "../../../test/test-repository.ts";
import { TASK_TABS, rowsForTab, tabCounts } from "../model.ts";

describe("task tab model", () => {
  it("every tab badge equals the rows that tab renders (seeded Alpha-1)", async () => {
    const { repo } = await createTestClinicalRepo({
      personaId: PERSONA_IDS.clinAlpha1,
      facilityId: FACILITY_IDS.alpha1,
    });
    const rows = (await repo.listFollowUps({ pageSize: 200 })).items;
    const now = new Date((await repo.demo.getDemoState()).clockIso);
    const counts = tabCounts(rows, now);
    for (const tab of TASK_TABS) {
      expect({ tab, n: rowsForTab(rows, tab, now).length }).toEqual({ tab, n: counts[tab] });
    }
    const awaiting = rowsForTab(rows, "awaitingConfirmation", now);
    expect(awaiting.map((fu) => fu.id)).toContain(SEED_ANCHORS.WF01_WORKER_COMPLETED_FU.followUpId);
    // Tabs are distinct predicates: Awaiting confirmation is not a copy of Due soon.
    const dueSoon = new Set(rowsForTab(rows, "dueSoon", now).map((fu) => fu.id));
    expect(awaiting.some((fu) => dueSoon.has(fu.id))).toBe(false);
  });
});
