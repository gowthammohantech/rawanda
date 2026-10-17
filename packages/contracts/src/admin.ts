/**
 * Programme Admin records (ADM-01): `AccessGrant` (collection `accessGrants`) and `TimeEntry`
 * (collection `timeEntries`). Both collections are pre-registered in the FND-07 `COLLECTIONS`
 * registry. FND-06 `scopeForPersona(persona, grant)` derives the actor scope from a grant; ADM-08
 * edits grants (every edit bumps `version`).
 *
 * DEMO ROLE SWITCH — NOT AUTHENTICATION. Grants model reporting scope for the prototype only.
 */
import { ROLES } from "@laif/domain";
import { z } from "zod";

import {
  DistrictIdSchema,
  FacilityIdSchema,
  PersonaIdSchema,
  persistedEntityShape,
} from "./entities.ts";
import { IsoDate, IsoUtcString, NonEmptyTrimmed } from "./primitives.ts";

/** `facilityIds` value meaning "every facility of the granted districts". */
export const ALL_IN_DISTRICTS = "ALL_IN_DISTRICTS" as const;

export const AccessGrantSchema = z.object({
  ...persistedEntityShape,
  id: NonEmptyTrimmed,
  personaId: PersonaIdSchema,
  role: z.enum(ROLES),
  districtIds: z.array(DistrictIdSchema),
  facilityIds: z.union([z.literal(ALL_IN_DISTRICTS), z.array(FacilityIdSchema)]),
  validFrom: IsoUtcString,
  validTo: IsoUtcString.exactOptional(),
  updatedBy: PersonaIdSchema,
});
export type AccessGrant = z.output<typeof AccessGrantSchema>;

/** Activities of the self-reported demo time log (ADM-05 workload proxy). */
export const TIME_ENTRY_ACTIVITIES = ["screening", "follow_up", "travel", "admin"] as const;
export type TimeEntryActivity = (typeof TIME_ENTRY_ACTIVITIES)[number];

export const TIME_ENTRY_SOURCES = ["self_reported_demo"] as const;

export const TimeEntrySchema = z.object({
  ...persistedEntityShape,
  id: NonEmptyTrimmed,
  workerId: PersonaIdSchema,
  facilityId: FacilityIdSchema,
  /** Kigali calendar date `YYYY-MM-DD`. */
  date: IsoDate,
  minutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  activity: z.enum(TIME_ENTRY_ACTIVITIES),
  source: z.enum(TIME_ENTRY_SOURCES),
});
export type TimeEntry = z.output<typeof TimeEntrySchema>;
