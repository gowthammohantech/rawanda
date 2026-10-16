import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { defineProject } from "vitest/config";

const require = createRequire(import.meta.url);
const resolveModule = (specifier: string) => require.resolve(specifier);
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * FND-10 decision: one test runner repo-wide. Native components are tested under Vitest +
 * jsdom with `react-native` aliased to `react-native-web` (and `.web.*` platform files
 * preferred, as Expo web / Metro do). True device behaviour is covered by REL-03.
 */
export default defineProject({
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: "react-native-web" },
      // Bare imports would resolve to the CommonJS `main` (which requires the real, Flow-typed
      // react-native); point them at the ESM builds so the alias and `.web.js` files apply.
      {
        find: /^react-native-svg$/,
        replacement: resolveModule("react-native-svg/lib/module/index.js"),
      },
      {
        find: /^react-native-safe-area-context$/,
        replacement: resolveModule("react-native-safe-area-context/lib/module/index.js"),
      },
      {
        find: /^@react-native\/assets-registry\/registry$/,
        replacement: local("./src/test/assets-registry.stub.ts"),
      },
      // expo-font is an optional peer owned by the FND-11 Expo apps; tests use a stub.
      { find: /^expo-font$/, replacement: local("./src/test/expo-font.stub.ts") },
    ],
    extensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".mjs", ".js", ".jsx", ".json"],
  },
  define: {
    __DEV__: "false",
  },
  test: {
    name: "@laif/ui-native",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    server: {
      deps: {
        // Processed by Vite so the alias and `.web.js` resolution apply inside them.
        inline: [/react-native-svg/, /react-native-safe-area-context/],
      },
    },
  },
});
