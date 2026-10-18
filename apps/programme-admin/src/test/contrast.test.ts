/**
 * ADM-09 task 7: AA contrast of the teal tokens for every text / background pair the admin app
 * uses (the shared kit pairs + the admin-specific ones: fault pill, warning callouts, the icon
 * rail's active item, the Settings notices). Normal text ≥ 4.5:1.
 */
import { colors, contrastRatio, TEXT_CONTRAST_PAIRS, type ColorToken } from "@laif/ui-web";
import { describe, expect, it } from "vitest";

const ADMIN_PAIRS: ReadonlyArray<readonly [ColorToken, ColorToken]> = [
  ["danger", "dangerSoft"], // FAULT SIMULATION ON pill, error notes
  ["ink", "warningSoft"], // session-expired notice, simulation banner
  ["ink", "dangerSoft"], // not-saved notes
  ["primaryDark", "primarySoft"], // icon rail active item, filter chips
  ["muted", "background"], // threshold preview, footnotes
  ["ink", "primarySoft"], // demo role note
  ["warning", "warningSoft"], // DEMO VALUE micro label
];

describe("token contrast (WCAG AA)", () => {
  it.each([...TEXT_CONTRAST_PAIRS, ...ADMIN_PAIRS])("%s on %s ≥ 4.5:1", (fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
