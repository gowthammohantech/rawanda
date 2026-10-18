/**
 * CLN-10 catalogue completeness: every audit action the clinical portal can show — each action
 * name written by the app source (CLN-01..10) and every action of the FND-07 registry (what the
 * repository emits on the app's behalf) — has a non-empty EN and RW `domain:audit.<action>` label.
 */
import { resources } from "@laif/i18n";
import { AUDIT_ACTION_NAMES, isAuditAction } from "@laif/repositories";
import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>("../../../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

function labelOf(lng: "en" | "rw", action: string): string | undefined {
  let node: unknown = (resources[lng] as Record<string, unknown>)["domain"];
  for (const part of ["audit", ...action.split(".")]) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" && node.trim() !== "" ? node : undefined;
}

/** `action: "x.y"` literals in the app source (tests excluded). */
function appEmittedActions(): string[] {
  const found = new Set<string>();
  for (const [path, text] of Object.entries(sources)) {
    if (path.includes("__tests__") || path.endsWith(".test.ts") || path.endsWith(".test.tsx")) {
      continue;
    }
    for (const match of text.matchAll(/action:\s*"([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)"/g)) {
      found.add(match[1] ?? "");
    }
  }
  return [...found].sort();
}

describe("audit action labels (CLN-10)", () => {
  it("finds the actions the clinical app writes", () => {
    const actions = appEmittedActions();
    expect(actions).toEqual(
      expect.arrayContaining(["access.denied", "conflict.resolved", "export.requested"]),
    );
  });

  it.each(appEmittedActions())("app action %s is registered and labelled EN + RW", (action) => {
    expect(isAuditAction(action)).toBe(true);
    expect(labelOf("en", action)).toBeDefined();
    expect(labelOf("rw", action)).toBeDefined();
  });

  it("every registered action (repository-emitted included) has EN + RW labels", () => {
    const missing = AUDIT_ACTION_NAMES.filter(
      (a) => labelOf("en", a) === undefined || labelOf("rw", a) === undefined,
    );
    expect(missing).toEqual([]);
  });
});
