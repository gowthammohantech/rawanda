import { ADMIN_GRANT_IDS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness } from "../testing/harness.ts";

describe("access grants (ADM-01)", () => {
  it("the admin store is seeded with one grant per admin persona, readable without a session", async () => {
    const h = await createHarness({ appId: "admin", personaId: null });
    const grants = await h.repo.listAccessGrants();
    expect(grants.map((g) => g.id).sort()).toEqual(Object.values(ADMIN_GRANT_IDS).sort());
    expect(grants.map((g) => g.personaId)).toEqual([...grants.map((g) => g.personaId)].sort());
    expect(grants.find((g) => g.personaId === PERSONA_IDS.fmgrAlpha1)).toMatchObject({
      facilityIds: ["fac-alpha-1"],
      version: 1,
    });
  });

  it("other apps have no grants", async () => {
    const h = await createHarness({ appId: "clinical", personaId: PERSONA_IDS.clinAlpha1 });
    expect(await h.repo.listAccessGrants()).toEqual([]);
  });
});
