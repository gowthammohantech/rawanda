import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PACKAGE_ORDER, checkDepGraph, readWorkspaceGraph } from "./check-dep-graph.ts";

describe("checkDepGraph", () => {
  it("accepts a graph that only points at earlier packages", () => {
    expect(
      checkDepGraph({
        "@laif/domain": [],
        "@laif/contracts": ["@laif/domain"],
        "@laif/repositories": ["@laif/domain", "@laif/contracts"],
      }),
    ).toEqual([]);
  });

  it("fails on a back-edge (domain → repositories)", () => {
    const errors = checkDepGraph({
      "@laif/domain": ["@laif/repositories"],
      "@laif/repositories": ["@laif/domain"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/@laif\/domain → @laif\/repositories: back-edge/);
  });

  it("fails on self-dependencies, unknown packages and app dependencies", () => {
    const errors = checkDepGraph({
      "@laif/analytics": ["@laif/analytics", "@laif/clinical-web"],
      "@laif/mystery": [],
    });
    expect(errors).toHaveLength(3);
  });

  it("allows ui-native to use ui-web (parity test) but not the reverse", () => {
    expect(checkDepGraph({ "@laif/ui-native": ["@laif/ui-web"] })).toEqual([]);
    expect(checkDepGraph({ "@laif/ui-web": ["@laif/ui-native"] })).toHaveLength(1);
  });

  it("passes for the real workspace, which declares all 10 packages", () => {
    const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
    const graph = readWorkspaceGraph(root);
    expect(Object.keys(graph).sort()).toEqual([...PACKAGE_ORDER].sort());
    expect(checkDepGraph(graph)).toEqual([]);
  });
});
