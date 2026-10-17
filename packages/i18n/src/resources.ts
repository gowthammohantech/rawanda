/**
 * Bundled catalogues (offline): every JSON file is statically imported, so it ships inside each
 * Vite / Metro bundle. There is no HTTP backend.
 *
 * Adding an area file (binding convention, FND-04 task 5): create
 * `locales/<lng>/<ns>/<area>.json` for BOTH languages, import it below and merge it under key
 * `<area>` of namespace `<ns>`, e.g.
 *
 *   import enClinicalQueue from "./locales/en/clinical/queue.json";
 *   clinical: { ...enClinical, queue: enClinicalQueue },
 *
 * `pnpm i18n:check` fails if a file on disk is not wired in here.
 */
import enAdmin from "./locales/en/admin.json";
import enCitizen from "./locales/en/citizen.json";
import enCitizenConsent from "./locales/en/citizen/consent.json";
import enCitizenErrors from "./locales/en/citizen/errors.json";
import enCitizenMore from "./locales/en/citizen/more.json";
import enCitizenNav from "./locales/en/citizen/nav.json";
import enCitizenOnboarding from "./locales/en/citizen/onboarding.json";
import enCitizenValidation from "./locales/en/citizen/validation.json";
import enClinical from "./locales/en/clinical.json";
import enClinicalCommon from "./locales/en/clinical/common.json";
import enClinicalErrors from "./locales/en/clinical/errors.json";
import enClinicalLogin from "./locales/en/clinical/login.json";
import enCommon from "./locales/en/common.json";
import enDemo from "./locales/en/demo.json";
import enDomain from "./locales/en/domain.json";
import enShell from "./locales/en/shell.json";
import enValidation from "./locales/en/validation.json";
import enWorker from "./locales/en/worker.json";
import enWorkerAuth from "./locales/en/worker/auth.json";
import enWorkerNav from "./locales/en/worker/nav.json";
import enWorkerSettings from "./locales/en/worker/settings.json";
import rwAdmin from "./locales/rw/admin.json";
import rwCitizen from "./locales/rw/citizen.json";
import rwCitizenConsent from "./locales/rw/citizen/consent.json";
import rwCitizenErrors from "./locales/rw/citizen/errors.json";
import rwCitizenMore from "./locales/rw/citizen/more.json";
import rwCitizenNav from "./locales/rw/citizen/nav.json";
import rwCitizenOnboarding from "./locales/rw/citizen/onboarding.json";
import rwCitizenValidation from "./locales/rw/citizen/validation.json";
import rwClinical from "./locales/rw/clinical.json";
import rwClinicalCommon from "./locales/rw/clinical/common.json";
import rwClinicalErrors from "./locales/rw/clinical/errors.json";
import rwClinicalLogin from "./locales/rw/clinical/login.json";
import rwCommon from "./locales/rw/common.json";
import rwDemo from "./locales/rw/demo.json";
import rwDomain from "./locales/rw/domain.json";
import rwShell from "./locales/rw/shell.json";
import rwValidation from "./locales/rw/validation.json";
import rwWorker from "./locales/rw/worker.json";
import rwWorkerAuth from "./locales/rw/worker/auth.json";
import rwWorkerNav from "./locales/rw/worker/nav.json";
import rwWorkerSettings from "./locales/rw/worker/settings.json";
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
  clinical: {
    ...enClinical,
    common: enClinicalCommon,
    login: enClinicalLogin,
    errors: enClinicalErrors,
  },
  worker: { ...enWorker, auth: enWorkerAuth, nav: enWorkerNav, settings: enWorkerSettings },
  admin: enAdmin,
  citizen: {
    ...enCitizen,
    errors: enCitizenErrors,
    onboarding: enCitizenOnboarding,
    consent: enCitizenConsent,
    nav: enCitizenNav,
    validation: enCitizenValidation,
    more: enCitizenMore,
  },
} as const satisfies Record<Namespace, object>;

/** Kinyarwanda drafts. Parity with EN is enforced by `pnpm i18n:check`, not by types. */
export const rwResources: Record<Namespace, object> = {
  common: rwCommon,
  validation: rwValidation,
  domain: rwDomain,
  demo: rwDemo,
  shell: rwShell,
  clinical: {
    ...rwClinical,
    common: rwClinicalCommon,
    login: rwClinicalLogin,
    errors: rwClinicalErrors,
  },
  worker: { ...rwWorker, auth: rwWorkerAuth, nav: rwWorkerNav, settings: rwWorkerSettings },
  admin: rwAdmin,
  citizen: {
    ...rwCitizen,
    errors: rwCitizenErrors,
    onboarding: rwCitizenOnboarding,
    consent: rwCitizenConsent,
    nav: rwCitizenNav,
    validation: rwCitizenValidation,
    more: rwCitizenMore,
  },
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
