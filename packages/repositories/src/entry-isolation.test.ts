/**
 * Entry isolation (FND-08 acceptance): the root entry, `./sqlite` and `./ids/web` never import
 * Dexie or the native Expo modules; only `./dexie`, `./expo-sqlite` and `./ids/native` do.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("dexie", () => {
  throw new Error("dexie was imported");
});
vi.mock("expo-sqlite", () => {
  throw new Error("expo-sqlite was imported");
});
vi.mock("expo-crypto", () => {
  throw new Error("expo-crypto was imported");
});

describe("entry isolation", () => {
  it("the root @laif/repositories entry loads with dexie and expo-* throwing on import", async () => {
    const root = await import("./index.ts");
    expect(root.createCareRepository).toBeTypeOf("function");
    expect(root.createMemoryStoreAdapter).toBeTypeOf("function");
    expect(root.dexieDbName("clinical")).toBe("laif-clinical");
  });

  it("./sqlite and ./ids/web load without dexie or native modules", async () => {
    const sqlite = await import("./store/sqlite-adapter.ts");
    expect(sqlite.createSqliteStoreAdapter).toBeTypeOf("function");
    const ids = await import("./ids/web.ts");
    expect(ids.createWebIdGenerator).toBeTypeOf("function");
  });

  it("the mocks are active: the platform entries do pull their module", async () => {
    const failure = async (load: () => Promise<unknown>): Promise<string> => {
      const error = (await load().then(
        () => null,
        (e: unknown) => e,
      )) as { message?: string; cause?: { message?: string } } | null;
      return `${error?.message ?? ""} ${error?.cause?.message ?? ""}`;
    };
    expect(await failure(() => import("./store/dexie-adapter.ts"))).toMatch(/dexie was imported/);
    expect(await failure(() => import("./store/expo-sqlite-executor.ts"))).toMatch(
      /expo-sqlite was imported/,
    );
    expect(await failure(() => import("./ids/native.ts"))).toMatch(/expo-crypto was imported/);
  });

  it("package.json maps each platform entry to its own file", async () => {
    const { default: pkg } = await import("../package.json", { with: { type: "json" } });
    expect(pkg.exports).toEqual({
      ".": "./src/index.ts",
      "./contract-suite": "./src/store/contract-suite.ts",
      "./dexie": "./src/store/dexie-adapter.ts",
      "./sqlite": "./src/store/sqlite-adapter.ts",
      "./expo-sqlite": "./src/store/expo-sqlite-executor.ts",
      "./ids/web": "./src/ids/web.ts",
      "./ids/native": "./src/ids/native.ts",
    });
    expect(pkg.peerDependenciesMeta).toEqual({
      "expo-crypto": { optional: true },
      "expo-sqlite": { optional: true },
    });
  });
});
