/**
 * DEMO_PERSONAS (FND-05 task 3): 18 stable personas used by all apps and tests. Role switching
 * is demo-only and not authentication. Staff carry a pseudonymous `workerCode`; display names
 * are invented (names.ts syllables), never real people.
 */
import {
  asId,
  type AppId,
  type DemoPersona,
  type DistrictId,
  type FacilityId,
  type Language,
  type PatientId,
  type PersonaId,
  type Role,
} from "@laif/domain";

import { patientId, PATIENT_INDEX } from "../seed/ids.ts";
import { DISTRICT_IDS } from "./districts.ts";
import { FACILITY_IDS } from "./facilities.ts";

export const PERSONA_IDS = {
  clinAlpha1: asId<PersonaId>("persona-clin-alpha1"),
  nurseAlpha2: asId<PersonaId>("persona-nurse-alpha2"),
  coordAlpha: asId<PersonaId>("persona-coord-alpha"),
  clinBeta1: asId<PersonaId>("persona-clin-beta1"),
  chwAlpha1A: asId<PersonaId>("persona-chw-alpha1-a"),
  chwAlpha1B: asId<PersonaId>("persona-chw-alpha1-b"),
  chwAlpha2A: asId<PersonaId>("persona-chw-alpha2-a"),
  chwBeta1A: asId<PersonaId>("persona-chw-beta1-a"),
  supAlpha: asId<PersonaId>("persona-sup-alpha"),
  leadProgramme: asId<PersonaId>("persona-lead-programme"),
  analystAlpha: asId<PersonaId>("persona-analyst-alpha"),
  fmgrAlpha1: asId<PersonaId>("persona-fmgr-alpha1"),
  auditorProgramme: asId<PersonaId>("persona-auditor-programme"),
  citizen1: asId<PersonaId>("persona-citizen-1"),
  citizen2: asId<PersonaId>("persona-citizen-2"),
  citizenWithdrawn: asId<PersonaId>("persona-citizen-withdrawn"),
  citizenRep: asId<PersonaId>("persona-citizen-rep"),
  citizenPending: asId<PersonaId>("persona-citizen-pending"),
} as const;

/** CTZ-P1…P5 → persona IDs (citizen wallet phase naming). */
export const CITIZEN_PERSONA_CODES = {
  "CTZ-P1": PERSONA_IDS.citizen1,
  "CTZ-P2": PERSONA_IDS.citizen2,
  "CTZ-P3": PERSONA_IDS.citizenWithdrawn,
  "CTZ-P4": PERSONA_IDS.citizenRep,
  "CTZ-P5": PERSONA_IDS.citizenPending,
} as const;

/** How the persona relates to its linked patient records (citizens only). */
export type CitizenLinkKind = "self" | "legal_representative" | "pending_verification";

export type PersonaSpec = {
  id: PersonaId;
  displayName: string;
  role: Role;
  appIds: AppId[];
  facilityIds: FacilityId[];
  districtIds: DistrictId[];
  programmeWide: boolean;
  workerCode: string | null;
  linkedPatientIds: PatientId[];
  preferredLanguage: Language;
  /** Human-readable scope summary used in docs/tests (not rendered; UI uses i18n). */
  scopeNote: string;
  citizenCode?: keyof typeof CITIZEN_PERSONA_CODES;
  citizenLink?: CitizenLinkKind;
  consentWithdrawn?: boolean;
};

const { alpha1, alpha2, beta1 } = FACILITY_IDS;

export const PERSONA_SPECS: readonly PersonaSpec[] = [
  staff(
    PERSONA_IDS.clinAlpha1,
    "Zorvel Quorandi",
    "clinician",
    ["clinical"],
    [alpha1],
    "CL-101",
    "en",
    "facility Alpha-1",
  ),
  staff(
    PERSONA_IDS.nurseAlpha2,
    "Quilra Xabezo",
    "nurse_reviewer",
    ["clinical"],
    [alpha2],
    "NR-201",
    "rw",
    "facility Alpha-2",
  ),
  staff(
    PERSONA_IDS.coordAlpha,
    "Vexqa Zelqiqua",
    "facility_coordinator",
    ["clinical"],
    [alpha1, alpha2],
    "FC-301",
    "en",
    "facilities Alpha-1, Alpha-2",
  ),
  staff(
    PERSONA_IDS.clinBeta1,
    "Tezrix Vorxoxe",
    "clinician",
    ["clinical"],
    [beta1],
    "CL-401",
    "rw",
    "facility Beta-1 (WF-04 counterpart)",
  ),
  staff(
    PERSONA_IDS.chwAlpha1A,
    "Oxavel Oquumbra",
    "community_health_worker",
    ["worker"],
    [alpha1],
    "HW-014",
    "rw",
    "own facility Alpha-1",
  ),
  staff(
    PERSONA_IDS.chwAlpha1B,
    "Ixozo Texaelix",
    "community_health_worker",
    ["worker"],
    [alpha1],
    "HW-015",
    "rw",
    "own facility Alpha-1",
  ),
  staff(
    PERSONA_IDS.chwAlpha2A,
    "Zephxin Ixalarqo",
    "community_health_worker",
    ["worker"],
    [alpha2],
    "HW-021",
    "rw",
    "own facility Alpha-2",
  ),
  staff(
    PERSONA_IDS.chwBeta1A,
    "Qorlequ Qemizu",
    "community_health_worker",
    ["worker"],
    [beta1],
    "HW-031",
    "rw",
    "own facility Beta-1",
  ),
  staff(
    PERSONA_IDS.supAlpha,
    "Xanra Zuxoandi",
    "field_supervisor",
    ["worker"],
    [alpha1, alpha2],
    "SV-002",
    "en",
    "facilities Alpha-1, Alpha-2 (picks one at sign-in, HWM-01)",
  ),
  {
    ...staff(
      PERSONA_IDS.leadProgramme,
      "Vaqvox Varqezo",
      "programme_lead",
      ["admin"],
      [],
      "PL-001",
      "en",
      "programme-wide",
    ),
    programmeWide: true,
  },
  {
    ...staff(
      PERSONA_IDS.analystAlpha,
      "Quavel Quoriqua",
      "district_analyst",
      ["admin"],
      [],
      "DA-011",
      "en",
      "district Alpha (WF-04 actor)",
    ),
    districtIds: [DISTRICT_IDS.alpha],
  },
  staff(
    PERSONA_IDS.fmgrAlpha1,
    "Xelzo Xaboxe",
    "facility_manager",
    ["admin"],
    [alpha1],
    "FM-101",
    "rw",
    "facility Alpha-1",
  ),
  {
    ...staff(
      PERSONA_IDS.auditorProgramme,
      "Zorqa Zelqumbra",
      "auditor",
      ["admin"],
      [],
      "AU-001",
      "en",
      "programme-wide, read-only governance",
    ),
    programmeWide: true,
  },
  citizen(
    PERSONA_IDS.citizen1,
    "Xelrix Quorezo",
    "CTZ-P1",
    [patientId(PATIENT_INDEX.ctzP1)],
    "self",
    "rw",
    "self",
  ),
  citizen(
    PERSONA_IDS.citizen2,
    "Oxaqa Vorxandi",
    "CTZ-P2",
    [patientId(PATIENT_INDEX.ctzP2)],
    "self",
    "en",
    "self",
  ),
  {
    ...citizen(
      PERSONA_IDS.citizenWithdrawn,
      "Tezvox Ixaliqua",
      "CTZ-P3",
      [patientId(PATIENT_INDEX.ctzP3Withdrawn)],
      "self",
      "rw",
      "self, consent withdrawn",
    ),
    consentWithdrawn: true,
  },
  citizen(
    PERSONA_IDS.citizenRep,
    "Quilxin Oxaezo",
    "CTZ-P4",
    [patientId(PATIENT_INDEX.ctzP4Represented)],
    "legal_representative",
    "rw",
    "legal representative of one linked patient (not self)",
  ),
  citizen(
    PERSONA_IDS.citizenPending,
    "Vexrix Qemandi",
    "CTZ-P5",
    [],
    "pending_verification",
    "en",
    "enrollment pending verification (no linked record until verified)",
  ),
];

function staff(
  id: PersonaId,
  displayName: string,
  role: Role,
  appIds: AppId[],
  facilityIds: FacilityId[],
  workerCode: string,
  preferredLanguage: Language,
  scopeNote: string,
): PersonaSpec {
  return {
    id,
    displayName,
    role,
    appIds,
    facilityIds,
    districtIds: [],
    programmeWide: false,
    workerCode,
    linkedPatientIds: [],
    preferredLanguage,
    scopeNote,
  };
}

function citizen(
  id: PersonaId,
  displayName: string,
  code: keyof typeof CITIZEN_PERSONA_CODES,
  linkedPatientIds: PatientId[],
  link: CitizenLinkKind,
  preferredLanguage: Language,
  scopeNote: string,
): PersonaSpec {
  return {
    id,
    displayName,
    role: "citizen",
    appIds: ["citizen"],
    facilityIds: [],
    districtIds: [],
    programmeWide: false,
    workerCode: null,
    linkedPatientIds,
    preferredLanguage,
    scopeNote,
    citizenCode: code,
    citizenLink: link,
  };
}

/** The 18 demo personas (reference table; `createSeed` stamps them as `DemoPersona` records). */
export const DEMO_PERSONAS = PERSONA_SPECS;

/** Fixed display names of the patients who are themselves citizen personas (self-linked). */
export const CITIZEN_PATIENT_NAMES: Readonly<Record<number, string>> = {
  [PATIENT_INDEX.ctzP1]: "Xelrix Quorezo",
  [PATIENT_INDEX.ctzP2]: "Oxaqa Vorxandi",
  [PATIENT_INDEX.ctzP3Withdrawn]: "Tezvox Ixaliqua",
  [PATIENT_INDEX.ctzP4Represented]: "Qorzo Texaumbra",
};

export function toDemoPersona(spec: PersonaSpec, createdAt: string): DemoPersona {
  return {
    id: spec.id,
    displayName: spec.displayName,
    role: spec.role,
    appIds: [...spec.appIds],
    facilityIds: [...spec.facilityIds],
    districtIds: [...spec.districtIds],
    programmeWide: spec.programmeWide,
    workerCode: spec.workerCode,
    linkedPatientIds: [...spec.linkedPatientIds],
    preferredLanguage: spec.preferredLanguage,
    version: 1,
    createdAt,
    updatedAt: createdAt,
    synthetic: true,
  };
}
