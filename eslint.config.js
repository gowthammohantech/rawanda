// @ts-check
// Repo-wide ESLint flat config for LAIF CareConnect (FND-01).
// Invariants enforced here: no wall-clock access outside the demo clock module,
// no raw hex colours in app/UI components, no cross-app imports, no imports of the
// read-only PrototypeFourApplications-main reference.
import js from "@eslint/js";
import i18next from "eslint-plugin-i18next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const APP_PACKAGES = [
  "@laif/clinical-web",
  "@laif/programme-admin",
  "@laif/worker-mobile",
  "@laif/citizen-wallet",
];

/** Deterministic demo clock rule: wall-clock reads only via packages/domain/src/clock. */
const NO_WALL_CLOCK_PROPERTIES = [
  {
    object: "Date",
    property: "now",
    message:
      "Use the demo clock from @laif/domain (packages/domain/src/clock) instead of Date.now().",
  },
];
const NO_WALL_CLOCK_SYNTAX = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      "Use the demo clock from @laif/domain (packages/domain/src/clock) instead of new Date().",
  },
];

/** Tokens only: no raw hex colour literals in components. */
const NO_HEX_SYNTAX = [
  {
    selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
    message: "Raw hex colours are not allowed in components; use semantic design tokens.",
  },
  {
    selector: "TemplateElement[value.raw=/^#[0-9a-fA-F]{3,8}$/]",
    message: "Raw hex colours are not allowed in components; use semantic design tokens.",
  },
];

const JSX_FILES = ["**/*.{jsx,tsx}"];

export default tseslint.config(
  {
    ignores: [
      "PrototypeFourApplications-main/**",
      "ref-images/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/.expo/**",
      "**/web-build/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },

  js.configs.recommended,

  // Type-aware TypeScript rules.
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },

  // Plain JS (config files): no type information.
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: { ...globals.node } },
  },

  // Repo-wide rules.
  {
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-restricted-imports": [
        "error",
        {
          paths: APP_PACKAGES.map((name) => ({
            name,
            message: "Apps are leaf nodes: nothing may import from an app.",
          })),
          patterns: [
            {
              group: ["**/apps/**", ...APP_PACKAGES.map((name) => `${name}/*`)],
              message: "Apps are leaf nodes: nothing may import from apps/*.",
            },
            {
              group: ["**/PrototypeFourApplications-main/**", "PrototypeFourApplications-main"],
              message:
                "PrototypeFourApplications-main is a read-only reference; copy what you need.",
            },
          ],
        },
      ],
    },
  },

  // Deterministic clock in all packages.
  {
    files: ["packages/**"],
    rules: {
      "no-restricted-properties": ["error", ...NO_WALL_CLOCK_PROPERTIES],
      "no-restricted-syntax": ["error", ...NO_WALL_CLOCK_SYNTAX],
    },
  },

  // Deterministic seed (FND-05): no Math.random in mock-data either — use the seeded PRNG.
  // (no-restricted-properties options are replaced, not merged, so repeat the clock rule.)
  {
    files: ["packages/mock-data/**"],
    rules: {
      "no-restricted-properties": [
        "error",
        ...NO_WALL_CLOCK_PROPERTIES,
        {
          object: "Math",
          property: "random",
          message:
            "Use the seeded PRNG from packages/mock-data/src/prng.ts instead of Math.random().",
        },
      ],
    },
  },

  // Tokens only in app sources.
  {
    files: ["apps/**/src/**"],
    rules: {
      "no-restricted-syntax": ["error", ...NO_HEX_SYNTAX],
    },
  },

  // UI package components: both the clock rule and the tokens rule
  // (no-restricted-syntax options are replaced, not merged, so combine them here).
  {
    files: ["packages/ui-*/src/components/**"],
    rules: {
      "no-restricted-syntax": ["error", ...NO_WALL_CLOCK_SYNTAX, ...NO_HEX_SYNTAX],
    },
  },

  // The demo clock module is the single allowed wall-clock reader.
  {
    files: ["packages/domain/src/clock/**"],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
    },
  },

  // React / accessibility / i18n rules for UI code (inherited by FND-09 onward).
  {
    files: ["apps/**/*.{jsx,tsx}", "packages/ui-*/**/*.{jsx,tsx}"],
    ...reactHooks.configs.flat["recommended-latest"],
  },
  {
    files: ["apps/**/*.{jsx,tsx}", "packages/ui-*/**/*.{jsx,tsx}"],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ["apps/**/*.{jsx,tsx}", "packages/ui-*/**/*.{jsx,tsx}"],
    ...i18next.configs["flat/recommended"],
    rules: {
      "i18next/no-literal-string": ["error", { mode: "jsx-text-only" }],
    },
  },
  {
    files: JSX_FILES,
    languageOptions: { globals: { ...globals.browser } },
  },

  // Repo scripts are CLIs and may print.
  {
    files: ["scripts/**"],
    rules: { "no-console": "off" },
  },
);
