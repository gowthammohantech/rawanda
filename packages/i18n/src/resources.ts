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
import enAdminAuth from "./locales/en/admin/auth.json";
import enAdminErrors from "./locales/en/admin/errors.json";
import enAdminShell from "./locales/en/admin/shell.json";
import enAdminCharts from "./locales/en/admin/charts.json";
import enAdminFilters from "./locales/en/admin/filters.json";
import enAdminOverview from "./locales/en/admin/overview.json";
import enAdminPrivacy from "./locales/en/admin/privacy.json";
import enCitizen from "./locales/en/citizen.json";
import enCitizenErrors from "./locales/en/citizen/errors.json";
import enClinical from "./locales/en/clinical.json";
import enClinicalCommon from "./locales/en/clinical/common.json";
import enClinicalErrors from "./locales/en/clinical/errors.json";
import enClinicalLogin from "./locales/en/clinical/login.json";
import enClinicalPatients from "./locales/en/clinical/patients.json";
import enClinicalSettings from "./locales/en/clinical/settings.json";
import enCommon from "./locales/en/common.json";
import enDemo from "./locales/en/demo.json";
import enDomain from "./locales/en/domain.json";
import enShell from "./locales/en/shell.json";
import enValidation from "./locales/en/validation.json";
import enWorker from "./locales/en/worker.json";
import enWorkerAuth from "./locales/en/worker/auth.json";
import enWorkerNav from "./locales/en/worker/nav.json";
import enWorkerNetsim from "./locales/en/worker/netsim.json";
import enWorkerSettings from "./locales/en/worker/settings.json";
import enWorkerSync from "./locales/en/worker/sync.json";
import rwAdmin from "./locales/rw/admin.json";
import rwAdminAuth from "./locales/rw/admin/auth.json";
import rwAdminErrors from "./locales/rw/admin/errors.json";
import rwAdminShell from "./locales/rw/admin/shell.json";
import rwAdminCharts from "./locales/rw/admin/charts.json";
import rwAdminFilters from "./locales/rw/admin/filters.json";
import rwAdminOverview from "./locales/rw/admin/overview.json";
import rwAdminPrivacy from "./locales/rw/admin/privacy.json";
import rwCitizen from "./locales/rw/citizen.json";
import rwCitizenErrors from "./locales/rw/citizen/errors.json";
import rwClinical from "./locales/rw/clinical.json";
import rwClinicalCommon from "./locales/rw/clinical/common.json";
import rwClinicalErrors from "./locales/rw/clinical/errors.json";
import rwClinicalLogin from "./locales/rw/clinical/login.json";
import rwClinicalPatients from "./locales/rw/clinical/patients.json";
import rwClinicalSettings from "./locales/rw/clinical/settings.json";
import rwCommon from "./locales/rw/common.json";
import rwDemo from "./locales/rw/demo.json";
import rwDomain from "./locales/rw/domain.json";
import rwShell from "./locales/rw/shell.json";
import rwValidation from "./locales/rw/validation.json";
import rwWorker from "./locales/rw/worker.json";
import rwWorkerAuth from "./locales/rw/worker/auth.json";
import rwWorkerNav from "./locales/rw/worker/nav.json";
import rwWorkerNetsim from "./locales/rw/worker/netsim.json";
import rwWorkerSettings from "./locales/rw/worker/settings.json";
import rwWorkerSync from "./locales/rw/worker/sync.json";
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
    settings: enClinicalSettings,
    patients: enClinicalPatients,
  },
  worker: {
    ...enWorker,
    auth: enWorkerAuth,
    nav: enWorkerNav,
    settings: enWorkerSettings,
    sync: enWorkerSync,
    netsim: enWorkerNetsim,
  },
  admin: {
    ...enAdmin,
    shell: enAdminShell,
    auth: enAdminAuth,
    errors: enAdminErrors,
    filters: enAdminFilters,
    overview: enAdminOverview,
    charts: enAdminCharts,
    privacy: enAdminPrivacy,
  },
  citizen: { ...enCitizen, errors: enCitizenErrors },
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
    settings: rwClinicalSettings,
    patients: rwClinicalPatients,
  },
  worker: {
    ...rwWorker,
    auth: rwWorkerAuth,
    nav: rwWorkerNav,
    settings: rwWorkerSettings,
    sync: rwWorkerSync,
    netsim: rwWorkerNetsim,
  },
  admin: {
    ...rwAdmin,
    shell: rwAdminShell,
    auth: rwAdminAuth,
    errors: rwAdminErrors,
    filters: rwAdminFilters,
    overview: rwAdminOverview,
    charts: rwAdminCharts,
    privacy: rwAdminPrivacy,
  },
  citizen: { ...rwCitizen, errors: rwCitizenErrors },
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
