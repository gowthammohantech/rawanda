import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { defineConfig } from "vitest/config";

const ROOT = import.meta.dirname;

/** Workspace project name → its directory (`@laif/repositories` → `packages/repositories`). */
function projectDirs(): Map<string, string> {
  const dirs = new Map<string, string>();
  for (const group of ["packages", "apps"]) {
    const base = join(ROOT, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const manifest = join(base, entry.name, "package.json");
      if (!entry.isDirectory() || !existsSync(manifest)) continue;
      const { name } = JSON.parse(readFileSync(manifest, "utf8")) as { name?: string };
      if (name) dirs.set(name, `${group}/${entry.name}`);
    }
  }
  return dirs;
}

/**
 * Projects selected with `--project <name>` / `--project=<name>`. When set, coverage is limited
 * to those projects' sources, so `vitest run --project @laif/x --coverage` gates only package x
 * (otherwise other packages' files loaded indirectly would be held to their own thresholds).
 */
function selectedProjectSources(argv: readonly string[]): string[] {
  const names: string[] = [];
  argv.forEach((arg, i) => {
    const next: unknown = argv[i + 1];
    if (arg === "--project" && typeof next === "string") names.push(next);
    else if (arg.startsWith("--project=")) names.push(arg.slice("--project=".length));
  });
  if (names.length === 0) return [];
  const dirs = projectDirs();
  return names.map((name) => `${dirs.get(name) ?? name}/**`);
}

const selected = selectedProjectSources(process.argv);

export default defineConfig({
  test: {
    // Cap parallelism: cold runs under load hit vitest-worker RPC "fetch" timeouts (FND-09 verification).
    maxWorkers: "50%",
    projects: ["packages/*", "apps/*", "scripts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      ...(selected.length > 0 ? { include: selected } : {}),
      exclude: ["PrototypeFourApplications-main/**", "ref-images/**", "**/node_modules/**"],
      // Per-phase coverage gates (applied when run with --coverage).
      thresholds: {
        // FND-02: ≥ 95% lines in the domain machines, rules engine and invariants.
        "packages/domain/src/machines/**": { lines: 95 },
        "packages/domain/src/rules/**": { lines: 95 },
        "packages/domain/src/invariants.ts": { lines: 95 },
        // FND-07: ≥ 90% lines in the repository services, sync and idempotency.
        "packages/repositories/src/services/**": { lines: 90 },
        "packages/repositories/src/sync/**": { lines: 90 },
        "packages/repositories/src/idempotency.ts": { lines: 90 },
      },
    },
  },
});
