/**
 * CLN-05 copy safety: no diagnostic wording in the `clinical:queue` EN catalogue nor in the
 * FND-02 reason texts the queue shows; reasons say "demo threshold", "urgent" says "demo".
 */
import { REASON_CODES } from "@laif/domain";
import { enResources } from "@laif/i18n";
import { describe, expect, it } from "vitest";

const BANNED = ["diagnosis", "diagnose", "hypertensive", "hypertension", "diabetic", "diabetes"];

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const queue = (enResources.clinical as { queue: unknown }).queue;
const reasons = (enResources.domain as { reason: Record<string, string> }).reason;

describe("clinical:queue copy safety", () => {
  it("has EN copy", () => {
    expect(strings(queue).length).toBeGreaterThan(40);
  });

  it.each(BANNED)("never uses %s", (word) => {
    for (const text of [...strings(queue), ...Object.values(reasons)]) {
      expect(text.toLowerCase(), text).not.toContain(word);
    }
  });

  it("threshold reasons say 'demo threshold'; urgent copy says demo", () => {
    for (const code of REASON_CODES.filter((c) => c.startsWith("DEMO_"))) {
      expect(reasons[code]).toContain("demo threshold");
    }
    const q = queue as { kpi: Record<string, string>; row: { status: Record<string, string> } };
    expect(q.kpi.urgent).toContain("demo");
    expect(q.kpi.urgentHint).toContain("not clinically validated");
    expect(q.row.status.urgentDemo?.toLowerCase()).toContain("demo");
  });
});
