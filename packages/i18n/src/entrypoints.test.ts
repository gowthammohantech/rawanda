import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));
const PLATFORM_ONLY =
  /^(react-dom(\/.*)?|react-native(\/.*)?|expo(-[a-z-]+)?(\/.*)?|@react-native.*)$/;

function importsOf(file: string): string[] {
  const source = readFileSync(join(SRC, file), "utf8");
  return [
    ...source.matchAll(
      /^\s*(?:import|export)[^"']*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm,
    ),
  ].map((m) => m[1] ?? m[2] ?? "");
}

/** Source modules reachable from the main entry (`src/index.ts`). */
function mainEntryGraph(): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of importsOf(file)) {
      if (spec.startsWith("./") && /\.tsx?$/.test(spec)) visit(spec.slice(2));
    }
  };
  visit("index.ts");
  return [...seen];
}

describe("entry points", () => {
  it("the main entry imports no DOM-only or RN-only module", () => {
    const graph = mainEntryGraph();
    expect(graph).toContain("react.tsx");
    expect(graph).not.toContain("storage.web.ts");
    expect(graph).not.toContain("storage.native.ts");
    for (const file of graph) {
      for (const spec of importsOf(file)) expect(spec, file).not.toMatch(PLATFORM_ONLY);
    }
  });

  it("platform adapters are separate entries in package.json", () => {
    const pkg = JSON.parse(readFileSync(join(SRC, "..", "package.json"), "utf8")) as {
      exports: Record<string, string>;
    };
    expect(pkg.exports).toEqual({
      ".": "./src/index.ts",
      "./web": "./src/storage.web.ts",
      "./native": "./src/storage.native.ts",
    });
  });

  it("no module reads the wall clock or DOM globals at top level", () => {
    for (const file of readdirSync(SRC).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))) {
      const source = readFileSync(join(SRC, file), "utf8");
      expect(source, file).not.toMatch(/Date\.now\(|new Date\(\)/);
      expect(source, file).not.toMatch(/^\s*(window|document|localStorage)\./m);
    }
  });
});
