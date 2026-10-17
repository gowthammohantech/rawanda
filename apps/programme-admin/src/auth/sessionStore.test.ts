import { createMemoryStorage } from "@laif/auth-demo";
import { buildAdminAccessGrants, PERSONA_IDS } from "@laif/mock-data";
import { asId, type CorrelationId } from "@laif/domain";
import { describe, expect, it } from "vitest";

import { findAdminPersona, ADMIN_PERSONAS } from "./personas.ts";
import { createAdminSessionStore, SESSION_STORAGE_KEY } from "./sessionStore.ts";

const grants = buildAdminAccessGrants("2026-07-16T06:00:00.000Z");
const analyst = findAdminPersona(PERSONA_IDS.analystAlpha)!;
const analystGrant = grants.find((g) => g.personaId === analyst.id)!;
const signInAnalyst = (store: ReturnType<typeof createAdminSessionStore>) =>
  store.signIn({
    persona: analyst,
    grant: analystGrant,
    reportingDistrictId: analystGrant.districtIds[0] ?? null,
    startedAt: "2026-10-14T06:00:00.000Z",
    correlationId: asId<CorrelationId>("corr-1"),
  });

describe("admin session store", () => {
  it("only the four FND-05 admin personas", () => {
    expect(ADMIN_PERSONAS.map((p) => p.id)).toEqual([
      PERSONA_IDS.leadProgramme,
      PERSONA_IDS.analystAlpha,
      PERSONA_IDS.fmgrAlpha1,
      PERSONA_IDS.auditorProgramme,
    ]);
  });

  it("starts signed out (no auto sign-in) and restores a stored session", () => {
    const storage = createMemoryStorage();
    const store = createAdminSessionStore(storage);
    expect(store.getState().session).toBeNull();
    expect(store.actor()).toBeNull();
    signInAnalyst(store);
    expect(store.actor()).toMatchObject({
      personaId: analyst.id,
      role: "district_analyst",
      scope: { kind: "district", districtIds: ["dist-alpha"] },
    });
    const restored = createAdminSessionStore(storage);
    expect(restored.getState().session).toMatchObject({
      personaId: analyst.id,
      grantId: analystGrant.id,
      grantVersion: 1,
      correlationId: "corr-1",
    });
  });

  it("drops an inconsistent stored session", () => {
    const storage = createMemoryStorage({
      "laif.admin.persona": PERSONA_IDS.leadProgramme,
      [SESSION_STORAGE_KEY]: JSON.stringify({ session: { personaId: "x" }, grant: {} }),
    });
    expect(createAdminSessionStore(storage).getState().session).toBeNull();
    expect(storage.getItem("laif.admin.persona")).toBeNull();
  });

  it("re-validation applies a newer grant version and ends the session for a removed grant", () => {
    const store = createAdminSessionStore(createMemoryStorage());
    signInAnalyst(store);
    expect(store.revalidate(grants)).toBe("unchanged");
    const edited = {
      ...analystGrant,
      version: 2,
      facilityIds: ["fac-alpha-2"],
    } as typeof analystGrant;
    expect(store.revalidate([edited])).toBe("updated");
    expect(store.getState()).toMatchObject({ grantChanges: 1, session: { grantVersion: 2 } });
    expect(store.actor()?.scope).toEqual({ kind: "facility", facilityIds: ["fac-alpha-2"] });
    expect(store.revalidate([])).toBe("revoked");
    expect(store.getState().session).toBeNull();
  });

  it("the once-registry claims a key once", () => {
    const store = createAdminSessionStore(createMemoryStorage());
    expect(store.once.claim("k")).toBe(true);
    expect(store.once.claim("k")).toBe(false);
  });
});
