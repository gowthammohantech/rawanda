/**
 * Enforces the shared-package dependency order (FND-01 / phases/00-foundation/INDEX.md):
 *
 *   domain → contracts → i18n → mock-data → auth-demo → analytics → repositories → test-utils
 *   ui-web (→ i18n, domain) → ui-native (→ i18n, domain; ui-web as devDependency for parity tests)
 *
 * A package may only depend on packages that come EARLIER in PACKAGE_ORDER. This forbids
 * back-edges and therefore cycles. Apps (apps/*) are leaves and are not checked here;
 * any package depending on an app is reported.
 *
 * Run: `tsx scripts/check-dep-graph.ts` (part of `pnpm lint`).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PACKAGE_ORDER = [
  "@laif/domain",
  "@laif/contracts",
  "@laif/i18n",
  "@laif/mock-data",
  "@laif/auth-demo",
  "@laif/analytics",
  "@laif/repositories",
  "@laif/test-utils",
  "@laif/ui-web",
  "@laif/ui-native",
] as const;

/** Package name → names of internal (`@laif/*`) packages it depends on (any dependency field). */
export type DepGraph = Readonly<Record<string, readonly string[]>>;

const INTERNAL_SCOPE = "@laif/";
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/** Returns a list of human-readable violations; empty means the graph is valid. */
export function checkDepGraph(graph: DepGraph, order: readonly string[] = PACKAGE_ORDER): string[] {
  const rank = new Map(order.map((name, index) => [name, index] as const));
  const errors: string[] = [];

  for (const [pkg, deps] of Object.entries(graph)) {
    const pkgRank = rank.get(pkg);
    if (pkgRank === undefined) {
      errors.push(`${pkg}: not listed in PACKAGE_ORDER (add it to scripts/check-dep-graph.ts)`);
      continue;
    }
    for (const dep of deps) {
      if (dep === pkg) {
        errors.push(`${pkg}: depends on itself`);
        continue;
      }
      const depRank = rank.get(dep);
      if (depRank === undefined) {
        errors.push(`${pkg} → ${dep}: unknown internal package (apps may not be dependencies)`);
      } else if (depRank > pkgRank) {
        errors.push(
          `${pkg} → ${dep}: back-edge (${dep} comes after ${pkg} in the dependency order)`,
        );
      }
    }
  }
  return errors;
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/** Reads `packages/<name>/package.json` files under `root` into a DepGraph. */
export function readWorkspaceGraph(root: string): DepGraph {
  const packagesDir = join(root, "packages");
  const graph: Record<string, string[]> = {};
  if (!existsSync(packagesDir)) return graph;

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(packagesDir, entry.name, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageJson;
    const name = manifest.name ?? entry.name;
    const deps = new Set<string>();
    for (const field of DEPENDENCY_FIELDS) {
      for (const dep of Object.keys(manifest[field] ?? {})) {
        if (dep.startsWith(INTERNAL_SCOPE)) deps.add(dep);
      }
    }
    graph[name] = [...deps].sort();
  }
  return graph;
}

function main(): void {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const graph = readWorkspaceGraph(root);
  const errors = checkDepGraph(graph);
  if (errors.length > 0) {
    console.error("check-dep-graph: package dependency order violated:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`check-dep-graph: ${Object.keys(graph).length} packages, dependency order OK`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  main();
}
