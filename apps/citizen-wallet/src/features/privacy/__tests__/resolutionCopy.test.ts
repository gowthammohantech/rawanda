/** CLN-09 correction resolution keys all have EN + RW citizen copy (no raw keys, no fallback). */
import { enResources, rwResources } from "@laif/i18n";
import { describe, expect, it } from "vitest";

import { KNOWN_RESOLUTION_KEYS, resolutionKeyOf } from "../copy.ts";

const RESOLUTION_KEYS = [
  "glucose_context_corrected",
  "reading_time_confirmed",
  "reading_value_corrected",
  "personal_details_corrected",
  "record_checked_no_change",
] as const;

describe("correction resolution copy", () => {
  it.each(RESOLUTION_KEYS)("%s → own EN + RW line", (key) => {
    expect(KNOWN_RESOLUTION_KEYS.has(key)).toBe(true);
    expect(resolutionKeyOf(key)).toBe(`citizen:correction.resolution.${key}`);
    const en = (enResources.citizen.correction.resolution as Record<string, string>)[key];
    const rwCitizen = rwResources.citizen as {
      correction: { resolution: Record<string, string> };
    };
    const rw = rwCitizen.correction.resolution[key];
    expect(en?.length).toBeGreaterThan(10);
    expect(rw?.length).toBeGreaterThan(10);
    expect(rw).not.toBe(en);
  });

  it("unknown keys fall back to the generic line", () => {
    expect(resolutionKeyOf("something_else")).toBe("citizen:correction.resolution.unknown");
    expect(resolutionKeyOf(null)).toBe("citizen:correction.resolution.unknown");
  });
});
