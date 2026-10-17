/**
 * @laif/contracts — runtime-validated Zod 4 schemas shared by every form, repository and
 * import path (FND-03). Validation messages are `validation:*` i18n keys, never English.
 */
export const PACKAGE = "@laif/contracts" as const;

export * from "./messages.ts";
export * from "./error-map.ts";
export * from "./primitives.ts";
export * from "./entities.ts";
export * from "./inputs.ts";
export * from "./filters.ts";
export * from "./results.ts";
export * from "./field-errors.ts";
export * from "./admin.ts";
export * from "./programmeAction.ts";
export * from "./citizen/index.ts";
