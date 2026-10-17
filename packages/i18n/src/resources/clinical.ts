/**
 * `clinical` namespace wiring (one module per app so app tracks never edit the same file).
 * Add an area: create `locales/{en,rw}/clinical/<area>.json`, import both below and add `<area>` to each object.
 */
import enClinicalBase from "../locales/en/clinical.json";
import enClinicalCommon from "../locales/en/clinical/common.json";
import enClinicalLogin from "../locales/en/clinical/login.json";
import enClinicalErrors from "../locales/en/clinical/errors.json";
import enClinicalSettings from "../locales/en/clinical/settings.json";
import enClinicalPatients from "../locales/en/clinical/patients.json";
import enClinicalTimeline from "../locales/en/clinical/timeline.json";
import enClinicalQueue from "../locales/en/clinical/queue.json";
import rwClinicalBase from "../locales/rw/clinical.json";
import rwClinicalCommon from "../locales/rw/clinical/common.json";
import rwClinicalLogin from "../locales/rw/clinical/login.json";
import rwClinicalErrors from "../locales/rw/clinical/errors.json";
import rwClinicalSettings from "../locales/rw/clinical/settings.json";
import rwClinicalPatients from "../locales/rw/clinical/patients.json";
import rwClinicalTimeline from "../locales/rw/clinical/timeline.json";
import rwClinicalQueue from "../locales/rw/clinical/queue.json";

export const enClinical = {
  ...enClinicalBase,
  common: enClinicalCommon,
  login: enClinicalLogin,
  errors: enClinicalErrors,
  settings: enClinicalSettings,
  patients: enClinicalPatients,
  timeline: enClinicalTimeline,
  queue: enClinicalQueue,
} as const;

export const rwClinical: object = {
  ...rwClinicalBase,
  common: rwClinicalCommon,
  login: rwClinicalLogin,
  errors: rwClinicalErrors,
  settings: rwClinicalSettings,
  patients: rwClinicalPatients,
  timeline: rwClinicalTimeline,
  queue: rwClinicalQueue,
};
