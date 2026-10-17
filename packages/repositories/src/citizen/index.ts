/**
 * `@laif/repositories/citizen` (CTZ-01): the Citizen Health Wallet facade over the FND-07 store,
 * pipeline, faults and audit. Root `@laif/repositories` does not import it.
 */
export * from "./CitizenRepository.ts";
export {
  correctionStatusOf,
  createCitizenRepository,
  currentConsent,
} from "./create-citizen-repository.ts";
export * from "./faults.ts";
