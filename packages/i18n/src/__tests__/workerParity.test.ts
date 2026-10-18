/**
 * HWM-10 catalogue parity: every `worker:*` and `validation:*` key exists in EN and RW (plural
 * forms compared per base key), no value is empty, placeholders match, and the RW instance never
 * renders a raw key (EN fallback included).
 */
import { describe, expect, it } from "vitest";

import { resources } from "../resources.ts";
import { createTestI18n } from "../testing.ts";

type Tree = { [key: string]: unknown };

const PLURAL = /_(zero|one|two|few|many|other)$/u;
const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*(?:,[^}]*)?\}\}/gu;

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") out.set(path, value);
    else if (typeof value === "object" && value !== null) {
      for (const [k, v] of flatten(value as Tree, path)) out.set(k, v);
    }
  }
  return out;
}

const baseKeys = (keys: Iterable<string>) => new Set([...keys].map((k) => k.replace(PLURAL, "")));
const placeholders = (value: string) => [...value.matchAll(PLACEHOLDER)].map((m) => m[1]).sort();

describe.each(["worker", "validation"] as const)("%s catalogue parity (EN ⇄ RW)", (ns) => {
  const en = flatten((resources.en as unknown as Record<string, Tree>)[ns]!);
  const rw = flatten((resources.rw as unknown as Record<string, Tree>)[ns]!);

  it("has 100% of the keys in both languages", () => {
    expect(en.size).toBeGreaterThan(0);
    expect([...baseKeys(rw.keys())].sort()).toEqual([...baseKeys(en.keys())].sort());
  });

  it("has no empty values and the same placeholders", () => {
    for (const [key, value] of en) {
      expect(value.trim(), `en ${key}`).not.toBe("");
      const other = rw.get(key) ?? rw.get(`${key.replace(PLURAL, "")}_other`);
      if (other === undefined) continue; // plural form that RW does not use
      expect(other.trim(), `rw ${key}`).not.toBe("");
      expect(placeholders(other), `placeholders ${key}`).toEqual(placeholders(value));
    }
  });

  it("the RW instance never shows a raw key", () => {
    const i18n = createTestI18n("rw", { appId: "worker" });
    for (const key of baseKeys(en.keys())) {
      const text = i18n.t(`${ns}:${key}`, { count: 2, defaultValue: "__missing__" });
      expect(text, key).not.toBe("__missing__");
      expect(text, key).not.toContain(`${ns}:`);
      expect(text, key).not.toBe(key);
    }
  });
});
