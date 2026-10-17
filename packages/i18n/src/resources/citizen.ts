/**
 * `citizen` namespace wiring (one module per app so app tracks never edit the same file).
 * Add an area: create `locales/{en,rw}/citizen/<area>.json`, import both below and add `<area>` to each object.
 */
import enCitizenBase from "../locales/en/citizen.json";
import enCitizenErrors from "../locales/en/citizen/errors.json";
import enCitizenOnboarding from "../locales/en/citizen/onboarding.json";
import enCitizenConsent from "../locales/en/citizen/consent.json";
import enCitizenNav from "../locales/en/citizen/nav.json";
import enCitizenValidation from "../locales/en/citizen/validation.json";
import enCitizenMore from "../locales/en/citizen/more.json";
import rwCitizenBase from "../locales/rw/citizen.json";
import rwCitizenErrors from "../locales/rw/citizen/errors.json";
import rwCitizenOnboarding from "../locales/rw/citizen/onboarding.json";
import rwCitizenConsent from "../locales/rw/citizen/consent.json";
import rwCitizenNav from "../locales/rw/citizen/nav.json";
import rwCitizenValidation from "../locales/rw/citizen/validation.json";
import rwCitizenMore from "../locales/rw/citizen/more.json";

export const enCitizen = {
  ...enCitizenBase,
  errors: enCitizenErrors,
  onboarding: enCitizenOnboarding,
  consent: enCitizenConsent,
  nav: enCitizenNav,
  validation: enCitizenValidation,
  more: enCitizenMore,
} as const;

export const rwCitizen: object = {
  ...rwCitizenBase,
  errors: rwCitizenErrors,
  onboarding: rwCitizenOnboarding,
  consent: rwCitizenConsent,
  nav: rwCitizenNav,
  validation: rwCitizenValidation,
  more: rwCitizenMore,
};
