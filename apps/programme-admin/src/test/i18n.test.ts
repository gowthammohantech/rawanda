/**
 * ADM-09 task 9 — i18n completeness of the admin app:
 * - key parity EN ⇄ RW across every `admin` area (and the `domain:audit.admin.*` labels);
 * - fallback: a RW key deleted from a test catalogue renders the EN string and logs a dev warning;
 * - RW number / date formatting (Africa/Kigali, same digits — the language never changes a value);
 * - every RW admin string still flagged for review is listed in the app README.
 * (The literal-string lint rule is `i18next/no-literal-string` in the root ESLint config.)
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createTestI18n,
  enResources,
  formatDate,
  formatDateTime,
  formatNumber,
  rwResources,
} from "@laif/i18n";
import { describe, expect, it, vi } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));

function keysOf(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    keysOf(v, prefix === "" ? k : `${prefix}.${k}`),
  );
}

/** i18next plural suffixes differ by language (RW drafts may use `_other` only). */
const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/u, "");

describe("admin i18n completeness (ADM-09)", () => {
  it("EN ⇄ RW key parity for every admin area", () => {
    const en = new Set(keysOf(enResources.admin).map(base));
    const rw = new Set(keysOf(rwResources.admin).map(base));
    expect([...en].filter((k) => !rw.has(k))).toEqual([]);
    expect([...rw].filter((k) => !en.has(k))).toEqual([]);
    for (const area of ["settings", "states"] as const) {
      expect(keysOf((enResources.admin as Record<string, unknown>)[area]).length).toBeGreaterThan(
        5,
      );
    }
  });

  it("audit labels of the admin actions exist in EN and RW", () => {
    const en = (enResources.domain as { audit: { admin: Record<string, unknown> } }).audit.admin;
    const rw = (rwResources.domain as { audit: { admin: Record<string, unknown> } }).audit.admin;
    expect(keysOf(rw).sort()).toEqual(keysOf(en).sort());
    expect(keysOf(en)).toContain("settings.suppression_threshold_changed");
  });

  it("a missing RW key falls back to EN and logs a dev warning", () => {
    const warn = vi.fn();
    const rwAdmin = structuredClone(rwResources.admin) as { settings: Record<string, unknown> };
    delete rwAdmin.settings["title"];
    const i18n = createTestI18n("rw", {
      appId: "admin",
      isDev: true,
      warn,
      resources: {
        en: enResources,
        rw: { ...(rwResources as unknown as Record<string, object>), admin: rwAdmin },
      },
    });
    expect(i18n.t("admin:settings.title")).toBe("Settings");
    expect(i18n.t("admin:settings.language")).toBe("Ururimi");
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(" ")).toContain("settings.title");
  });

  it("RW numbers and dates: same digits, Kigali time, translated month names", () => {
    expect(formatNumber(1234.5, "rw")).toBe(formatNumber(1234.5, "en"));
    expect(formatNumber(10, "rw")).toBe("10");
    const iso = "2026-10-14T06:00:00.000Z"; // 08:00 in Kigali
    expect(formatDateTime(iso, "rw")).toContain("08:00");
    expect(formatDate(iso, "rw")).not.toBe(formatDate(iso, "en"));
    expect(formatDate(iso, "rw")).toContain("2026");
  });

  it("the README lists every RW admin string still marked for review", () => {
    const review = JSON.parse(
      readFileSync(resolve(HERE, "../../../../packages/i18n/src/locales/rw/_review.json"), "utf8"),
    ) as Record<string, string>;
    const readme = readFileSync(resolve(HERE, "../../README.md"), "utf8");
    const flagged = Object.entries(review)
      .filter(
        ([key, status]) =>
          (key.startsWith("admin:") || key.startsWith("domain:audit.admin.")) &&
          status === "needs clinical/linguistic review",
      )
      .map(([key]) => key);
    for (const key of flagged) expect(readme, key).toContain(`\`${key}\``);
  });
});
