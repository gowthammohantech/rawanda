import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { resources } from "../packages/i18n/src/resources.ts";
import {
  checkCatalogues,
  findUnusedKeys,
  loadCataloguesFromDisk,
  parseArgs,
  reviewBacklog,
  runI18nCheck,
  type Catalogues,
} from "./i18n-check.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LOCALES = join(ROOT, "packages", "i18n", "src", "locales");

function realCatalogues(): Catalogues {
  return JSON.parse(JSON.stringify(resources)) as Catalogues;
}

function run(argv: string[], root = ROOT) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runI18nCheck(
    argv,
    root,
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err };
}

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway repo root whose locales are a copy of the real ones. */
function tempRoot(): { root: string; locales: string } {
  const root = mkdtempSync(join(tmpdir(), "i18n-check-"));
  temps.push(root);
  const locales = join(root, "packages", "i18n", "src", "locales");
  mkdirSync(locales, { recursive: true });
  cpSync(LOCALES, locales, { recursive: true });
  return { root, locales };
}

describe("i18n:check on the repo", () => {
  it("passes for the committed catalogues", () => {
    const { code, out, err } = run([]);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(out.at(-1)).toMatch(/catalogues OK \(9 namespaces/);
  });

  it("disk catalogues equal what resources.ts bundles", () => {
    const loaded = loadCataloguesFromDisk(LOCALES);
    expect(loaded.errors).toEqual([]);
    expect(checkCatalogues(loaded.catalogues, { bundled: realCatalogues() }).errors).toEqual([]);
  });

  it("fails when an RW key is removed from a locale file", () => {
    const { root, locales } = tempRoot();
    const file = join(locales, "rw", "common.json");
    const data = JSON.parse(readFileSync(file, "utf8")) as { actions: Record<string, string> };
    delete data.actions["save"];
    writeFileSync(file, JSON.stringify(data));
    const { code, err } = run([], root);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("rw common:actions.save: missing (present in EN)");
  });

  it("--ns limits the check, --report lists the review backlog", () => {
    const { root, locales } = tempRoot();
    const file = join(locales, "rw", "common.json");
    const data = JSON.parse(readFileSync(file, "utf8")) as { actions: Record<string, string> };
    delete data.actions["save"];
    writeFileSync(file, JSON.stringify(data));
    expect(run(["--ns", "validation"], root).code).toBe(0);
    expect(run(["--ns", "common"], root).code).toBe(1);
    const report = run(["--ns", "domain", "--report"]);
    expect(report.code).toBe(0);
    expect(report.out.join("\n")).toContain("domain:reason.GLUCOSE_UNIT_MISSING");
    expect(run(["--ns", "nope"]).code).toBe(1);
  });

  it("--unused lists keys not referenced in source without failing", () => {
    const { code, out } = run(["--unused"]);
    expect(code).toBe(0);
    expect(out.some((l) => l.startsWith("i18n:check unused"))).toBe(true);
  });

  it("detects an area file that is not wired into resources.ts", () => {
    const { root, locales } = tempRoot();
    for (const lng of ["en", "rw"]) {
      mkdirSync(join(locales, lng, "clinical"), { recursive: true });
      writeFileSync(join(locales, lng, "clinical", "queue.json"), JSON.stringify({ title: lng }));
    }
    const { code, err } = run([], root);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("clinical: locales on disk differ from resources.ts");
  });

  it("rejects bad arguments", () => {
    expect(() => parseArgs(["--ns"])).toThrow();
    expect(() => parseArgs(["--bogus"])).toThrow();
    expect(parseArgs(["--ns=demo", "--report", "--unused"])).toEqual({
      ns: "demo",
      report: true,
      unused: true,
    });
    expect(run(["--bogus"]).code).toBe(2);
  });
});

describe("checkCatalogues rules", () => {
  it("flags RW keys not in EN, empty EN strings, non-strings and placeholder drift", () => {
    const c = realCatalogues();
    (c["rw"]!["common"] as Record<string, unknown>)["extra"] = "x";
    (c["en"]!["shell"] as Record<string, unknown>)["skipToContent"] = " ";
    (c["en"]!["demo"] as Record<string, unknown>)["banner"] = 42;
    (c["rw"]!["validation"] as Record<string, unknown>)["reasonTooShort"] = "Impamvu {{max}}";
    const errors = checkCatalogues(c).errors.join("\n");
    expect(errors).toContain("rw common:extra: not in EN");
    expect(errors).toContain("en shell:skipToContent: empty string");
    expect(errors).toContain("en demo:banner: value must be a string");
    expect(errors).toContain(
      "rw validation:reasonTooShort: placeholders {max} differ from EN {min}",
    );
  });

  it("requires every domain/validation key", () => {
    const c = realCatalogues();
    const reason = (c["en"]!["domain"] as { reason: Record<string, unknown> }).reason;
    delete reason["GLUCOSE_UNIT_MISSING"];
    const rwReason = (c["rw"]!["domain"] as { reason: Record<string, unknown> }).reason;
    delete rwReason["GLUCOSE_UNIT_MISSING"];
    const errors = checkCatalogues(c).errors.join("\n");
    expect(errors).toContain("en domain:reason.GLUCOSE_UNIT_MISSING: required key absent");
    const validation = checkCatalogues(c, { requiredKeys: ["validation:brandNew"] }).errors;
    expect(validation).toContain("en validation:brandNew: required key absent");
  });

  it("compares plural forms per base key", () => {
    const c = realCatalogues();
    const rel = (c["rw"]!["common"] as { relative: Record<string, unknown> }).relative;
    delete rel["daysAgo_one"];
    expect(checkCatalogues(c).errors).toEqual([]);
    delete rel["daysAgo_other"];
    rel["daysAgo_few"] = "x {{count}}";
    expect(checkCatalogues(c).errors).toContain(
      'rw common:relative.daysAgo_other: plural "other" form missing',
    );
  });

  it("validates _review.json entries", () => {
    const errors = checkCatalogues(realCatalogues(), {
      reviewFlags: { "common:nope": "draft", "common:actions.save": "approved" },
    }).errors;
    expect(errors).toContain("rw/_review.json common:nope: no such RW key");
    expect(errors).toContain('rw/_review.json common:actions.save: unknown flag "approved"');
    expect(reviewBacklog({ "a:x": "needs clinical/linguistic review", "b:y": "draft" })).toEqual({
      a: ["a:x"],
    });
  });

  it("findUnusedKeys honours literals, ns:key, template prefixes and required keys", () => {
    const c: Catalogues = {
      en: { shell: { a: "A", b: { c: "C" }, d: "D", e_one: "1", e_other: "n" } },
      rw: {},
    };
    const unused = findUnusedKeys(c, ['t("a")', "t(`b.${x}`)", "t('shell:e')"], {
      ns: "shell",
      requiredKeys: [],
    });
    expect(unused).toEqual(["shell:d"]);
  });
});
