import { describe, expect, it } from "vitest";

import { PACKAGE } from "./index.ts";

describe("@laif/auth-demo", () => {
  it("exports its package name", () => {
    expect(PACKAGE).toBe("@laif/auth-demo");
  });
});
