import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL(".", import.meta.url));
const pkg = JSON.parse(readFileSync(join(srcDir, "..", "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("@laif/domain package boundaries", () => {
  it("has zero runtime dependencies", () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    expect(Object.keys(pkg.peerDependencies ?? {})).toEqual([]);
  });

  it("non-test sources import only relative modules (no React, storage or I/O)", () => {
    for (const file of sourceFiles(srcDir)) {
      if (file.includes(`${"/"}testing${"/"}`)) continue; // test-only builders
      const source = readFileSync(file, "utf8");
      const specifiers = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/gu)].map((m) => m[1]);
      for (const specifier of specifiers) expect(specifier, file).toMatch(/^\.\.?\//u);
    }
  });
});
