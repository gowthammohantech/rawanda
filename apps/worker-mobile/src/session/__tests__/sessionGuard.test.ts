import { describe, expect, it } from "vitest";

import { REVOKED_HREF, sessionRedirect, SIGN_IN_HREF, TABS_HREF } from "../sessionGuard.ts";

describe("sessionRedirect (HWM-01 SessionGuard)", () => {
  it("app area: signed_out → /sign-in, revoked → /revoked, signed_in → stay", () => {
    expect(sessionRedirect("signed_out", "app")).toBe(SIGN_IN_HREF);
    expect(sessionRedirect("revoked", "app")).toBe(REVOKED_HREF);
    expect(sessionRedirect("signed_in", "app")).toBeNull();
  });

  it("app area: the denied screen stays reachable after a refused sign-in", () => {
    expect(sessionRedirect("signed_out", "app", { allowSignedOut: true })).toBeNull();
    expect(sessionRedirect("revoked", "app", { allowSignedOut: true })).toBe(REVOKED_HREF);
  });

  it("auth area: signed_in → tabs, revoked → /revoked, signed_out → stay", () => {
    expect(sessionRedirect("signed_in", "auth")).toBe(TABS_HREF);
    expect(sessionRedirect("revoked", "auth")).toBe(REVOKED_HREF);
    expect(sessionRedirect("signed_out", "auth")).toBeNull();
  });

  it("entry: always one destination; loading renders nothing new (splash)", () => {
    expect(sessionRedirect("signed_in", "entry")).toBe(TABS_HREF);
    expect(sessionRedirect("signed_out", "entry")).toBe(SIGN_IN_HREF);
    expect(sessionRedirect("revoked", "entry")).toBe(REVOKED_HREF);
    expect(sessionRedirect("loading", "app")).toBeNull();
  });
});
