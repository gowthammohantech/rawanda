/** CLN-01 §6: session persistence and the active-facility invariant. */
import { createMemoryStorage } from "@laif/auth-demo";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it, vi } from "vitest";

import { createAppSession, FACILITY_STORAGE_KEY } from "../session-store.ts";

describe("clinical session store", () => {
  it("starts without a session (no default persona)", () => {
    expect(createAppSession(createMemoryStorage()).state()).toBeNull();
  });

  it("signs in, survives a 'reload' and signs out", () => {
    const storage = createMemoryStorage();
    const session = createAppSession(storage);
    const listener = vi.fn();
    session.subscribe(listener);
    const result = session.signIn(PERSONA_IDS.coordAlpha, FACILITY_IDS.alpha2);
    expect(result.ok).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(session.state()).toBe(session.state()); // stable snapshot

    const reloaded = createAppSession(storage);
    expect(reloaded.state()).toMatchObject({
      persona: { id: PERSONA_IDS.coordAlpha },
      activeFacilityId: FACILITY_IDS.alpha2,
      permittedFacilityIds: [FACILITY_IDS.alpha1, FACILITY_IDS.alpha2],
    });
    expect(reloaded.setActiveFacility(FACILITY_IDS.alpha1)).toBe(true);
    expect(reloaded.setActiveFacility(FACILITY_IDS.beta1)).toBe(false);
    expect(reloaded.state()?.activeFacilityId).toBe(FACILITY_IDS.alpha1);

    reloaded.signOut();
    expect(reloaded.state()).toBeNull();
    expect(storage.entries()).toEqual({});
  });

  it("refuses a facility outside the persona's permitted set and non-clinical personas", () => {
    const session = createAppSession(createMemoryStorage());
    expect(session.signIn(PERSONA_IDS.clinAlpha1, FACILITY_IDS.beta1)).toEqual({
      ok: false,
      reason: "FACILITY_NOT_PERMITTED",
    });
    expect(session.signIn(PERSONA_IDS.chwAlpha1A, FACILITY_IDS.alpha1)).toEqual({
      ok: false,
      reason: "APP_NOT_ALLOWED",
    });
    expect(session.signIn("persona-nobody", FACILITY_IDS.alpha1)).toEqual({
      ok: false,
      reason: "UNKNOWN_PERSONA",
    });
    expect(session.state()).toBeNull();
  });

  it("clears a stored session whose facility violates the invariant", () => {
    const storage = createMemoryStorage({
      "laif.clinical.persona": PERSONA_IDS.clinAlpha1,
      [FACILITY_STORAGE_KEY]: FACILITY_IDS.beta1,
    });
    const session = createAppSession(storage);
    expect(session.state()).toBeNull();
    expect(session.current()).toBeNull();
    expect(storage.entries()).toEqual({});
  });

  it("clears a stored persona without a facility", () => {
    const storage = createMemoryStorage({ "laif.clinical.persona": PERSONA_IDS.clinAlpha1 });
    expect(createAppSession(storage).state()).toBeNull();
    expect(storage.entries()).toEqual({});
  });
});
