/**
 * Typed keys: augments i18next with the English resources so `t('clinical:queue.title')` is
 * checked by `tsc` and a misspelt key fails `pnpm typecheck` (FND-04 task 5).
 */
import type { DEFAULT_NAMESPACE, enResources } from "./resources.ts";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: typeof enResources;
  }
}

export {};
