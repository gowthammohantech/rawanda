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
import enCitizenHealth from "../locales/en/citizen/health.json";
import enCitizenNextSteps from "../locales/en/citizen/nextSteps.json";
import enCitizenNextStep from "../locales/en/citizen/nextStep.json";
import enCitizenReminders from "../locales/en/citizen/reminders.json";
import enCitizenTimeline from "../locales/en/citizen/timeline.json";
import enCitizenPrivacy from "../locales/en/citizen/privacy.json";
import enCitizenCorrection from "../locales/en/citizen/correction.json";
import enCitizenAccessibility from "../locales/en/citizen/accessibility.json";
import enCitizenSupport from "../locales/en/citizen/support.json";
import enCitizenHelp from "../locales/en/citizen/help.json";
import rwCitizenBase from "../locales/rw/citizen.json";
import rwCitizenErrors from "../locales/rw/citizen/errors.json";
import rwCitizenOnboarding from "../locales/rw/citizen/onboarding.json";
import rwCitizenConsent from "../locales/rw/citizen/consent.json";
import rwCitizenNav from "../locales/rw/citizen/nav.json";
import rwCitizenValidation from "../locales/rw/citizen/validation.json";
import rwCitizenMore from "../locales/rw/citizen/more.json";
import rwCitizenHealth from "../locales/rw/citizen/health.json";
import rwCitizenNextSteps from "../locales/rw/citizen/nextSteps.json";
import rwCitizenNextStep from "../locales/rw/citizen/nextStep.json";
import rwCitizenReminders from "../locales/rw/citizen/reminders.json";
import rwCitizenTimeline from "../locales/rw/citizen/timeline.json";
import rwCitizenPrivacy from "../locales/rw/citizen/privacy.json";
import rwCitizenCorrection from "../locales/rw/citizen/correction.json";
import rwCitizenAccessibility from "../locales/rw/citizen/accessibility.json";
import rwCitizenSupport from "../locales/rw/citizen/support.json";
import rwCitizenHelp from "../locales/rw/citizen/help.json";

export const enCitizen = {
  ...enCitizenBase,
  errors: enCitizenErrors,
  onboarding: enCitizenOnboarding,
  consent: enCitizenConsent,
  nav: enCitizenNav,
  validation: enCitizenValidation,
  more: enCitizenMore,
  health: enCitizenHealth,
  nextSteps: enCitizenNextSteps,
  nextStep: enCitizenNextStep,
  reminders: enCitizenReminders,
  timeline: enCitizenTimeline,
  privacy: enCitizenPrivacy,
  correction: enCitizenCorrection,
  accessibility: enCitizenAccessibility,
  support: enCitizenSupport,
  help: enCitizenHelp,
} as const;

export const rwCitizen: object = {
  ...rwCitizenBase,
  errors: rwCitizenErrors,
  onboarding: rwCitizenOnboarding,
  consent: rwCitizenConsent,
  nav: rwCitizenNav,
  validation: rwCitizenValidation,
  more: rwCitizenMore,
  health: rwCitizenHealth,
  nextSteps: rwCitizenNextSteps,
  nextStep: rwCitizenNextStep,
  reminders: rwCitizenReminders,
  timeline: rwCitizenTimeline,
  privacy: rwCitizenPrivacy,
  correction: rwCitizenCorrection,
  accessibility: rwCitizenAccessibility,
  support: rwCitizenSupport,
  help: rwCitizenHelp,
};
