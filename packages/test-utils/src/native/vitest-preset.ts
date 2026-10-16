/**
 * `@laif/test-utils/native/vitest` — the shared Vitest setup for React Native code (FND-10
 * decision, extracted in FND-11): jsdom + `react-native` aliased to `react-native-web`, `.web.*`
 * platform files preferred (as Expo web / Metro do), ESM builds of react-native-svg /
 * react-native-safe-area-context, and stubs for modules that need the Expo native runtime.
 *
 *   // vitest.config.ts of a native package or Expo app
 *   import { nativeTestConfig } from "@laif/test-utils/native/vitest";
 *   export default defineProject({ ...nativeTestConfig(import.meta.url), test: { … } });
 *
 * Imported by Vitest config files only (Node), never by test or app code.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const stub = (name: string): string => fileURLToPath(new URL(`./stubs/${name}`, import.meta.url));

export type NativeAlias = { find: RegExp; replacement: string };

/** Extension order: platform `.web.*` first, then the shared files. */
export const NATIVE_TEST_EXTENSIONS = [
  ".web.tsx",
  ".web.ts",
  ".web.js",
  ".tsx",
  ".ts",
  ".mjs",
  ".js",
  ".jsx",
  ".json",
] as const;

/** Dependencies Vite must process so the alias and `.web.js` resolution apply inside them. */
export const NATIVE_TEST_INLINE_DEPS: RegExp[] = [
  /react-native-svg/,
  /react-native-safe-area-context/,
];

/**
 * Aliases resolved from the consuming package (`configUrl` = its `import.meta.url`).
 * `extra` aliases come first (e.g. an app stubbing `expo-router`).
 */
export function nativeTestAliases(configUrl: string, extra: NativeAlias[] = []): NativeAlias[] {
  const require = createRequire(configUrl);
  return [
    ...extra,
    { find: /^react-native$/, replacement: "react-native-web" },
    // Bare imports would resolve to the CommonJS `main` (which requires the real, Flow-typed
    // react-native); point them at the ESM builds so the alias and `.web.js` files apply.
    {
      find: /^react-native-svg$/,
      replacement: require.resolve("react-native-svg/lib/module/index.js"),
    },
    {
      find: /^react-native-safe-area-context$/,
      replacement: require.resolve("react-native-safe-area-context/lib/module/index.js"),
    },
    // Imported by react-native-svg's web build; absent in RN 0.88.
    { find: /^@react-native\/assets-registry\/registry$/, replacement: stub("assets-registry.ts") },
    // expo-font loads through the Expo native runtime; tests treat fonts as loaded.
    { find: /^expo-font$/, replacement: stub("expo-font.ts") },
  ];
}

/** `resolve` + `define` + `test.server.deps.inline` for a native Vitest project. */
export function nativeTestConfig(configUrl: string, extra: NativeAlias[] = []) {
  return {
    resolve: {
      alias: nativeTestAliases(configUrl, extra),
      extensions: [...NATIVE_TEST_EXTENSIONS],
    },
    define: { __DEV__: "false" },
  };
}
