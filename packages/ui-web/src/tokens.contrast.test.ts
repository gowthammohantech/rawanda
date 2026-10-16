import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  colors,
  contrastRatio,
  cssColorVar,
  semanticColors,
  TEXT_CONTRAST_PAIRS,
  type ColorToken,
} from "./tokens.ts";

describe("token contrast (WCAG AA)", () => {
  it.each(TEXT_CONTRAST_PAIRS.map(([fg, bg]) => [fg, bg] as const))(
    "%s on %s is ≥ 4.5:1",
    (fg, bg) => {
      expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("subtle text passes on white (adjusted from the spec #7B898F)", () => {
    expect(contrastRatio("#7B898F", colors.surface)).toBeLessThan(4.5);
    expect(contrastRatio(colors.subtle, colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("computes known ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
});

describe("tokens.css ⇄ tokens.ts parity", () => {
  // jsdom replaces the global URL class, so resolve the path from the string form.
  const css = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "styles", "tokens.css"),
    "utf8",
  );

  it.each(Object.entries(colors) as [ColorToken, string][])(
    "%s is declared with the same value",
    (token, hex) => {
      const match = new RegExp(`${cssColorVar(token)}:\\s*(#[0-9a-fA-F]{6});`).exec(css);
      expect(match?.[1]?.toUpperCase()).toBe(hex.toUpperCase());
    },
  );

  it.each(Object.entries(semanticColors))("semantic %s aliases %s", (alias, base) => {
    const name = cssColorVar(alias as keyof typeof semanticColors);
    expect(css).toContain(`${name}: var(${cssColorVar(base)});`);
  });

  it("declares the required radii 8/12/16/24 and shell 24", () => {
    for (const [name, px] of [
      ["sm", 8],
      ["md", 12],
      ["lg", 16],
      ["xl", 24],
      ["shell", 24],
    ] as const) {
      expect(css).toContain(`--radius-${name}: ${px}px;`);
    }
  });
});
