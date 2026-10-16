import { describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => {
  let n = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("runtime id generators", () => {
  it("web: crypto.randomUUID, unique per call", async () => {
    const { createWebIdGenerator } = await import("./web.ts");
    const next = createWebIdGenerator();
    const a = next();
    const b = next();
    expect(a).toMatch(UUID);
    expect(b).not.toBe(a);
  });

  it("web: missing crypto.randomUUID → DEPENDENCY_UNAVAILABLE", async () => {
    const { createWebIdGenerator } = await import("./web.ts");
    let caught: unknown = null;
    try {
      createWebIdGenerator({});
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
  });

  it("native: expo-crypto randomUUID", async () => {
    const { createNativeIdGenerator } = await import("./native.ts");
    const next = createNativeIdGenerator();
    expect(next()).toBe("00000000-0000-4000-8000-000000000001");
    expect(next()).toBe("00000000-0000-4000-8000-000000000002");
  });
});
