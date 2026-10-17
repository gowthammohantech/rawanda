/**
 * Bundled catalogues (offline): every JSON file is statically imported, so it ships inside each
 * Vite / Metro bundle. There is no HTTP backend.
 *
 * Adding an area file (binding convention, FND-04 task 5): create
 * `locales/<lng>/<ns>/<area>.json` for BOTH languages, import it in the app module
 * `resources/<ns>.ts` (clinical, worker, admin, citizen) and add it under key `<area>`.
 *
 * `pnpm i18n:check` fails if a file on disk is not wired in here.
 */
import { enAdmin, rwAdmin } from "./resources/admin.ts";
import { enCitizen, rwCitizen } from "./resources/citizen.ts";
import { enClinical, rwClinical } from "./resources/clinical.ts";
import { enWorker, rwWorker } from "./resources/worker.ts";
import enCommon from "./locales/en/common.json";
import enDemo from "./locales/en/demo.json";
import enDomain from "./locales/en/domain.json";
import enShell from "./locales/en/shell.json";
import enValidation from "./locales/en/validation.json";
import rwCommon from "./locales/rw/common.json";
import rwDemo from "./locales/rw/demo.json";
import rwDomain from "./locales/rw/domain.json";
import rwShell from "./locales/rw/shell.json";
import rwValidation from "./locales/rw/validation.json";
import rwReview from "./locales/rw/_review.json";

export const NAMESPACES = [
  "common",
  "validation",
  "domain",
  "demo",
  "shell",
  "clinical",
  "worker",
  "admin",
  "citizen",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE = "common" as const satisfies Namespace;

/** English: the source of truth for key types and the runtime fallback. */
export const enResources = {
  common: enCommon,
  validation: enValidation,
  domain: enDomain,
  demo: enDemo,
  shell: enShell,
  clinical: enClinical,
  worker: enWorker,
  admin: enAdmin,
  citizen: enCitizen,
} as const satisfies Record<Namespace, object>;

/** Kinyarwanda drafts. Parity with EN is enforced by `pnpm i18n:check`, not by types. */
export const rwResources: Record<Namespace, object> = {
  common: rwCommon,
  validation: rwValidation,
  domain: rwDomain,
  demo: rwDemo,
  shell: rwShell,
  clinical: rwClinical,
  worker: rwWorker,
  admin: rwAdmin,
  citizen: rwCitizen,
};

export const resources = { en: enResources, rw: rwResources } as const;

export const NEEDS_REVIEW = "needs clinical/linguistic review" as const;
export const TRANSLATION_REVIEW_FLAGS = [NEEDS_REVIEW, "draft"] as const;
export type TranslationReviewFlag = (typeof TRANSLATION_REVIEW_FLAGS)[number];

/**
 * `locales/rw/_review.json`: `{ "<ns>:<key>": TranslationReviewFlag }`. Never rendered in the UI; read by
 * the admin governance page, REL-05 and `pnpm i18n:check --report`.
 */
export const rwReviewFlags: Readonly<Record<string, string>> = rwReview;
