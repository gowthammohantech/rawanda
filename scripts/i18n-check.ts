/**
 * The repo's single catalogue check (FND-04 task 10): `pnpm i18n:check [--ns <name>] [--report]
 * [--unused]`. Part of `pnpm lint`.
 *
 * Fails when:
 * - an EN key is missing in RW, or a RW key is not in EN (plural suffixes compared per base key);
 * - `{{placeholders}}` differ between EN and RW for the same key;
 * - an EN string is empty, or a leaf is not a string;
 * - a required `domain` / `validation` key (every FND-02 enum value, reason/invariant code,
 *   past-due label and `VALIDATION_KEYS` entry) is absent;
 * - a file under `locales/` is not wired into `resources.ts` (or an area file collides with a key);
 * - `rw/_review.json` names a missing key or an unknown flag.
 *
 * `--report` prints the `_review.json` backlog per namespace; `--unused` lists EN keys that no
 * source file references (informational, never fails).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { requiredCatalogueKeys } from "../packages/i18n/src/domain-keys.ts";
import {
  NAMESPACES,
  NEEDS_REVIEW,
  resources as bundledResources,
  TRANSLATION_REVIEW_FLAGS,
} from "../packages/i18n/src/resources.ts";

export const LANGUAGES = ["en", "rw"] as const;
export const SOURCE_LANGUAGE = "en";
export const REVIEW_FILE = "_review.json";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
/** lng → ns → nested catalogue */
export type Catalogues = Record<string, Record<string, JsonObject>>;

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*(?:,[^}]*)?\}\}/g;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── Loading ──────────────────────────────────────────────────────────────────
export type LoadResult = {
  catalogues: Catalogues;
  reviewFlags: Record<string, unknown>;
  errors: string[];
};

function readJson(path: string, errors: string[], root: string): JsonObject | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (isObject(parsed)) return parsed;
    errors.push(`${relative(root, path)}: top level must be an object`);
  } catch (error) {
    errors.push(`${relative(root, path)}: invalid JSON (${(error as Error).message})`);
  }
  return null;
}

/** Reads `locales/<lng>/<ns>.json` and `locales/<lng>/<ns>/<area>.json` (merged under `<area>`). */
export function loadCataloguesFromDisk(localesDir: string): LoadResult {
  const errors: string[] = [];
  const catalogues: Catalogues = {};
  let reviewFlags: Record<string, unknown> = {};
  const known = new Set<string>(NAMESPACES);

  for (const lng of LANGUAGES) {
    const lngDir = join(localesDir, lng);
    catalogues[lng] = {};
    if (!existsSync(lngDir)) {
      errors.push(`locales/${lng}: directory missing`);
      continue;
    }
    for (const entry of readdirSync(lngDir).sort()) {
      const path = join(lngDir, entry);
      if (entry === REVIEW_FILE) {
        if (lng !== "rw") errors.push(`locales/${lng}/${entry}: review flags live only in rw/`);
        else reviewFlags = readJson(path, errors, localesDir) ?? {};
        continue;
      }
      const isDir = statSync(path).isDirectory();
      const ns = isDir ? entry : entry.replace(/\.json$/, "");
      if (!isDir && !entry.endsWith(".json")) {
        errors.push(`locales/${lng}/${entry}: unexpected file`);
        continue;
      }
      if (!known.has(ns)) {
        errors.push(`locales/${lng}/${entry}: unknown namespace "${ns}" (add it to NAMESPACES)`);
        continue;
      }
      const target = (catalogues[lng][ns] ??= {});
      if (!isDir) {
        const data = readJson(path, errors, localesDir);
        if (data === null) continue;
        for (const [key, value] of Object.entries(data)) {
          if (key in target)
            errors.push(
              `locales/${lng}/${entry}: key "${key}" collides with area file ${ns}/${key}.json`,
            );
          target[key] = value;
        }
        continue;
      }
      for (const areaFile of readdirSync(path).sort()) {
        if (!areaFile.endsWith(".json")) {
          errors.push(`locales/${lng}/${ns}/${areaFile}: unexpected file`);
          continue;
        }
        const area = areaFile.replace(/\.json$/, "");
        const data = readJson(join(path, areaFile), errors, localesDir);
        if (data === null) continue;
        if (area in target) {
          errors.push(
            `locales/${lng}/${ns}/${areaFile}: area "${area}" collides with key ${ns}:${area}`,
          );
        }
        target[area] = data;
      }
    }
  }
  return { catalogues, reviewFlags, errors };
}

// ── Checks ───────────────────────────────────────────────────────────────────
/** Flattens to `dotted.key → leaf`; non-object leaves only. */
export function flattenKeys(obj: JsonObject, prefix = ""): Map<string, Json> {
  const out = new Map<string, Json>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (isObject(value)) for (const [k, v] of flattenKeys(value, path)) out.set(k, v);
    else out.set(path, value);
  }
  return out;
}

function placeholders(value: Json | undefined): string[] {
  if (typeof value !== "string") return [];
  return [...new Set([...value.matchAll(PLACEHOLDER)].map((m) => m[1] ?? ""))].sort();
}

/** Groups plural variants under their base key (`x_one`, `x_other` → `x`). */
function groupKeys(keys: Map<string, Json>): Map<string, { keys: string[]; plural: boolean }> {
  const groups = new Map<string, { keys: string[]; plural: boolean }>();
  for (const key of keys.keys()) {
    const plural = PLURAL_SUFFIX.test(key);
    const base = plural ? key.replace(PLURAL_SUFFIX, "") : key;
    const group = groups.get(base) ?? { keys: [], plural };
    group.keys.push(key);
    group.plural ||= plural;
    groups.set(base, group);
  }
  return groups;
}

function hasKey(catalogue: JsonObject | undefined, dotted: string): Json | undefined {
  let node: Json | undefined = catalogue;
  for (const part of dotted.split(".")) {
    if (!isObject(node)) return undefined;
    node = node[part];
  }
  return node;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((k) => [k, sortDeep(value[k])]),
  );
}

export type CheckOptions = {
  /** Limit every check to one namespace. */
  ns?: string;
  /** Fully qualified keys that must exist (defaults to `requiredCatalogueKeys()`). */
  requiredKeys?: readonly string[];
  /** `rw/_review.json` contents. */
  reviewFlags?: Record<string, unknown>;
  /** What `resources.ts` bundles; when given, disk and bundle must match. */
  bundled?: Catalogues;
};

export type CheckResult = { errors: string[]; warnings: string[] };

export function checkCatalogues(catalogues: Catalogues, options: CheckOptions = {}): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nsList = options.ns === undefined ? [...NAMESPACES] : [options.ns];
  if (options.ns !== undefined && !(NAMESPACES as readonly string[]).includes(options.ns)) {
    errors.push(`--ns ${options.ns}: unknown namespace (known: ${NAMESPACES.join(", ")})`);
    return { errors, warnings };
  }
  const target = LANGUAGES.filter((l) => l !== SOURCE_LANGUAGE);

  for (const ns of nsList) {
    const en = catalogues[SOURCE_LANGUAGE]?.[ns];
    if (en === undefined) {
      errors.push(`${SOURCE_LANGUAGE}/${ns}: namespace missing`);
      continue;
    }
    const enFlat = flattenKeys(en);
    for (const [key, value] of enFlat) {
      if (typeof value !== "string") errors.push(`en ${ns}:${key}: value must be a string`);
      else if (value.trim() === "") errors.push(`en ${ns}:${key}: empty string`);
    }
    const enGroups = groupKeys(enFlat);

    for (const lng of target) {
      const other = catalogues[lng]?.[ns];
      if (other === undefined) {
        errors.push(`${lng}/${ns}: namespace missing`);
        continue;
      }
      const otherFlat = flattenKeys(other);
      const otherGroups = groupKeys(otherFlat);
      for (const [key, value] of otherFlat) {
        if (typeof value !== "string") errors.push(`${lng} ${ns}:${key}: value must be a string`);
        else if (value.trim() === "")
          warnings.push(`${lng} ${ns}:${key}: empty (falls back to EN)`);
      }
      for (const [base, group] of enGroups) {
        const match = otherGroups.get(base);
        if (match === undefined) {
          errors.push(`${lng} ${ns}:${base}: missing (present in EN)`);
          continue;
        }
        if (group.plural !== match.plural) {
          errors.push(`${lng} ${ns}:${base}: plural forms differ from EN`);
          continue;
        }
        if (match.plural && !match.keys.includes(`${base}_other`)) {
          errors.push(`${lng} ${ns}:${base}_other: plural "other" form missing`);
        }
        const enVars = [...new Set(group.keys.flatMap((k) => placeholders(enFlat.get(k))))].sort();
        const otherVars = [
          ...new Set(match.keys.flatMap((k) => placeholders(otherFlat.get(k)))),
        ].sort();
        if (enVars.join(",") !== otherVars.join(",")) {
          errors.push(
            `${lng} ${ns}:${base}: placeholders {${otherVars.join(",")}} differ from EN {${enVars.join(",")}}`,
          );
        }
      }
      for (const base of otherGroups.keys()) {
        if (!enGroups.has(base)) errors.push(`${lng} ${ns}:${base}: not in EN`);
      }
    }

    if (options.bundled !== undefined) {
      for (const lng of LANGUAGES) {
        if (!sameJson(catalogues[lng]?.[ns], options.bundled[lng]?.[ns])) {
          errors.push(
            `${lng}/${ns}: locales on disk differ from resources.ts (wire every locales/<lng>/<ns>/<area>.json into resources.ts)`,
          );
        }
      }
    }
  }

  const required = options.requiredKeys ?? requiredCatalogueKeys();
  for (const fullKey of required) {
    const [ns = "", key = ""] = fullKey.split(":");
    if (!nsList.includes(ns)) continue;
    for (const lng of LANGUAGES) {
      if (typeof hasKey(catalogues[lng]?.[ns], key) !== "string") {
        errors.push(`${lng} ${fullKey}: required key absent`);
      }
    }
  }

  const allowed = new Set<string>(TRANSLATION_REVIEW_FLAGS);
  for (const [fullKey, flag] of Object.entries(options.reviewFlags ?? {})) {
    const [ns = "", key = ""] = fullKey.split(":");
    if (!nsList.includes(ns)) continue;
    if (typeof hasKey(catalogues["rw"]?.[ns], key) !== "string") {
      errors.push(`rw/${REVIEW_FILE} ${fullKey}: no such RW key`);
    }
    if (typeof flag !== "string" || !allowed.has(flag)) {
      errors.push(`rw/${REVIEW_FILE} ${fullKey}: unknown flag ${JSON.stringify(flag)}`);
    }
  }

  return { errors, warnings };
}

// ── Reports ──────────────────────────────────────────────────────────────────
/** Keys still flagged `needs clinical/linguistic review`, per namespace. */
export function reviewBacklog(
  reviewFlags: Record<string, unknown>,
  ns?: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [fullKey, flag] of Object.entries(reviewFlags)) {
    if (flag !== NEEDS_REVIEW) continue;
    const [keyNs = ""] = fullKey.split(":");
    if (ns !== undefined && keyNs !== ns) continue;
    (out[keyNs] ??= []).push(fullKey);
  }
  return out;
}

const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs)$/;
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".turbo",
  ".expo",
  "locales",
  "web-build",
]);

export function collectSources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
      } else if (SOURCE_EXTENSIONS.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(readFileSync(join(dir, entry.name), "utf8"));
      }
    }
  };
  for (const top of ["apps", "packages"]) {
    const base = join(root, top);
    if (!existsSync(base)) continue;
    for (const pkg of readdirSync(base)) walk(join(base, pkg, "src"));
    for (const pkg of readdirSync(base)) walk(join(base, pkg, "app"));
  }
  return out;
}

/** EN keys not referenced by any source (literal key, `ns:key`, or a template-literal prefix). */
export function findUnusedKeys(
  catalogues: Catalogues,
  sources: readonly string[],
  options: { ns?: string; requiredKeys?: readonly string[] } = {},
): string[] {
  const corpus = sources.join("\n");
  const dynamicPrefixes = new Set<string>();
  for (const match of corpus.matchAll(/`([\w.:-]+)\$\{/g)) dynamicPrefixes.add(match[1] ?? "");
  const required = new Set(options.requiredKeys ?? requiredCatalogueKeys());
  const unused: string[] = [];
  for (const ns of options.ns === undefined ? NAMESPACES : [options.ns]) {
    const en = catalogues[SOURCE_LANGUAGE]?.[ns];
    if (en === undefined) continue;
    const bases = new Set<string>();
    for (const key of flattenKeys(en).keys()) bases.add(key.replace(PLURAL_SUFFIX, ""));
    for (const base of bases) {
      const full = `${ns}:${base}`;
      const stripped = base.replace(/_[a-z]+$/, "");
      const candidates = [base, full, stripped, `${ns}:${stripped}`];
      const used =
        required.has(full) ||
        candidates.some(
          (c) =>
            corpus.includes(`"${c}"`) || corpus.includes(`'${c}'`) || corpus.includes(`\`${c}\``),
        ) ||
        [...dynamicPrefixes].some((p) => p !== "" && (full.startsWith(p) || base.startsWith(p)));
      if (!used) unused.push(full);
    }
  }
  return unused;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
export type CliArgs = { ns?: string; report: boolean; unused: boolean };

export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { report: false, unused: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--report") args.report = true;
    else if (arg === "--unused") args.unused = true;
    else if (arg === "--ns") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--ns needs a namespace");
      args.ns = value;
      i++;
    } else if (arg?.startsWith("--ns=")) args.ns = arg.slice("--ns=".length);
    else if (arg !== "--") throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

export function runI18nCheck(
  argv: readonly string[],
  root: string,
  log: (line: string) => void = console.log,
  logError: (line: string) => void = console.error,
): number {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    logError(`i18n:check: ${(error as Error).message}`);
    return 2;
  }
  const localesDir = join(root, "packages", "i18n", "src", "locales");
  const loaded = loadCataloguesFromDisk(localesDir);
  const result = checkCatalogues(loaded.catalogues, {
    ...(args.ns === undefined ? {} : { ns: args.ns }),
    reviewFlags: loaded.reviewFlags,
    bundled: bundledResources as unknown as Catalogues,
  });
  const errors = [...loaded.errors, ...result.errors];
  for (const warning of result.warnings) log(`  warning: ${warning}`);

  if (args.report) {
    const backlog = reviewBacklog(loaded.reviewFlags, args.ns);
    const total = Object.values(backlog).reduce((n, keys) => n + keys.length, 0);
    log(`i18n:check report — ${total} RW keys marked "${NEEDS_REVIEW}":`);
    for (const [ns, keys] of Object.entries(backlog)) {
      log(`  ${ns} (${keys.length})`);
      for (const key of keys) log(`    ${key}`);
    }
  }
  if (args.unused) {
    const unused = findUnusedKeys(
      loaded.catalogues,
      collectSources(root),
      args.ns === undefined ? {} : { ns: args.ns },
    );
    log(`i18n:check unused — ${unused.length} keys not referenced in source:`);
    for (const key of unused) log(`  ${key}`);
  }

  const scope = args.ns === undefined ? `${NAMESPACES.length} namespaces` : `namespace ${args.ns}`;
  if (errors.length > 0) {
    logError(`i18n:check: ${errors.length} problem(s) in ${scope}:`);
    for (const error of errors) logError(`  - ${error}`);
    return 1;
  }
  log(`i18n:check: EN/RW catalogues OK (${scope}, ${LANGUAGES.join("+")})`);
  return 0;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  process.exitCode = runI18nCheck(process.argv.slice(2), root);
}
