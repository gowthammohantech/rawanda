import { describe, expect, it } from "vitest";

import { ADDED_ICON_NAMES, ICON_DATA, ICON_NAMES, PROTOTYPE_ICON_NAMES } from "./icon-data.ts";

const REQUIRED_NEW = [
  "alert",
  "info",
  "filter",
  "globe",
  "lock",
  "clock",
  "wifi-off",
  "refresh",
  "eye",
  "file",
  "chevron-down",
  "external",
] as const;

describe("icon data", () => {
  it("contains every prototype icon and every FND-09 addition", () => {
    for (const name of PROTOTYPE_ICON_NAMES) expect(ICON_DATA[name]).toBeDefined();
    for (const name of REQUIRED_NEW)
      expect((ADDED_ICON_NAMES as readonly string[]).includes(name)).toBe(true);
  });

  it("has unique names and data for exactly the declared names", () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    expect(Object.keys(ICON_DATA).sort()).toEqual([...ICON_NAMES].sort());
  });

  it.each(ICON_NAMES)("%s has valid nodes inside the 24×24 box", (name) => {
    const nodes = ICON_DATA[name];
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      if (node[0] === "path") {
        expect(node[1].d).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
        expect(node[1].d.trim().charAt(0)).toMatch(/[Mm]/);
      } else {
        const { cx, cy, r } = node[1];
        expect(r).toBeGreaterThan(0);
        expect(cx - r).toBeGreaterThanOrEqual(0);
        expect(cy + r).toBeLessThanOrEqual(24);
      }
    }
  });

  it("ports the prototype paths verbatim (spot check)", () => {
    expect(ICON_DATA.check).toEqual([["path", { d: "m5 12 4 4L19 6" }]]);
    expect(ICON_DATA.search).toEqual([
      ["circle", { cx: 11, cy: 11, r: 7 }],
      ["path", { d: "m20 20-4-4" }],
    ]);
  });
});
