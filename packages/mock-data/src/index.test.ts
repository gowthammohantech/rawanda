import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PACKAGE } from "./index.ts";

describe("@laif/mock-data", () => {
  it("exports its package name", () => {
    expect(PACKAGE).toBe("@laif/mock-data");
  });
});

describe("determinism lint guard", () => {
  it("has no Math.random, Date.now or zero-argument new Date() in src/", () => {
    const root = import.meta.dirname;
    const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      expect(readFileSync(join(root, file), "utf8"), file).not.toMatch(
        /Math\.random\(|Date\.now\(|new Date\(\)/,
      );
    }
  });
});
