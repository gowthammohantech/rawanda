/**
 * Per-app seed slices (decision D3, FND-05 task 8). Each app seeds its own local store from
 * `sliceForApp(createSeed(), appId, personaId?)`:
 *
 * - `worker`: only the patients (and their records / tasks) of the worker persona's facilities.
 *   The simulated remote (FND-07) is seeded with the FULL seed so cross-facility denial is provable.
 * - `citizen`: the patients linked to the five citizen personas, released care instructions only,
 *   plus the citizen overlay (`buildCitizenOverlay`, delivered in CTZ-01).
 * - `clinical`: the full seed.
 * - `admin`: the full seed plus the admin analytics overlay (`buildAdminAnalyticsOverlay`, ADM-01).
 *
 * Overlays are deterministic, registered in `SLICE_OVERLAYS` below, never change the base seed
 * (counts asserted in counts.test.ts stay fixed) and keep record IDs so REL-01 bundles merge.
 */
import {
  asId,
  type AppId,
  type DemoPersona,
  type DemoRuleset,
  type PatientId,
  type PersonaId,
} from "@laif/domain";

import { PERSONA_IDS } from "./reference/personas.ts";
import { buildAdminAnalyticsOverlay } from "./scenarios/adminAnalytics.ts";
import { SEED_COLLECTIONS, type SeedCollectionName, type SeedDataset } from "./seed/types.ts";

/**
 * Records an overlay adds: base collection names are appended to; any other name is a new
 * collection. Rows are keyed by `id` (rulesets, which have no `id`, by `version`).
 */
export type OverlayRecords = Partial<
  Record<string, ReadonlyArray<{ readonly id: string } | DemoRuleset>>
>;

const rowKey = (row: object): string =>
  String((row as { id?: unknown }).id ?? (row as { version?: unknown }).version);

/** A deterministic overlay builder; must not mutate `base`. */
export type SliceOverlay = (base: Readonly<SeedDataset>) => OverlayRecords;

/**
 * The overlay registry. ADM-01 registers `admin: buildAdminAnalyticsOverlay`; CTZ-01 registers
 * `citizen: buildCitizenOverlay`. Until then the slices carry no overlay records.
 */
export const SLICE_OVERLAYS: Readonly<Partial<Record<AppId, SliceOverlay>>> = {
  admin: (base) => buildAdminAnalyticsOverlay(base),
};

export type SeedSlice = SeedDataset & {
  slice: { appId: AppId; personaId: PersonaId | null };
  /** Overlay collections that are not part of the base seed (e.g. `accessGrants`, `citizenAccounts`). */
  extraCollections: Record<string, Array<{ id: string }>>;
};

export type SliceOptions = {
  /** Overrides `SLICE_OVERLAYS` (tests, or an app wiring its overlay explicitly). */
  overlays?: Readonly<Partial<Record<AppId, SliceOverlay>>>;
};

/** Default worker persona when `sliceForApp(seed, 'worker')` is called without one. */
export const DEFAULT_WORKER_PERSONA_ID = PERSONA_IDS.chwAlpha1A;

const WORKER_ROLES = new Set(["community_health_worker", "field_supervisor"]);

export function sliceForApp(
  seed: SeedDataset,
  appId: AppId,
  personaId?: PersonaId | string,
  options: SliceOptions = {},
): SeedSlice {
  const base = structuredClone(seed);
  let sliced: SeedDataset;
  let slicePersona: PersonaId | null = null;

  switch (appId) {
    case "clinical":
    case "admin":
      sliced = base;
      break;
    case "worker": {
      const persona = findPersona(base, asId<PersonaId>(personaId ?? DEFAULT_WORKER_PERSONA_ID));
      if (!WORKER_ROLES.has(persona.role)) {
        throw new RangeError(`sliceForApp('worker'): ${persona.id} is not a worker-app persona`);
      }
      slicePersona = persona.id;
      const facilities = new Set<string>(persona.facilityIds);
      const patientIds = new Set<string>(
        base.patients.filter((p) => facilities.has(p.facilityId)).map((p) => p.id),
      );
      sliced = byPatients(base, patientIds, {
        facilityIds: facilities,
        releasedInstructionsOnly: false,
      });
      break;
    }
    case "citizen": {
      if (personaId !== undefined) slicePersona = findPersona(base, asId<PersonaId>(personaId)).id;
      const patientIds = new Set<string>(
        base.personas.filter((p) => p.role === "citizen").flatMap((p) => p.linkedPatientIds),
      );
      sliced = byPatients(base, patientIds, { facilityIds: null, releasedInstructionsOnly: true });
      break;
    }
  }

  const overlay = (options.overlays ?? SLICE_OVERLAYS)[appId];
  const extraCollections: Record<string, Array<{ id: string }>> = {};
  if (overlay) {
    const records = overlay(structuredClone(seed));
    for (const [name, rows] of Object.entries(records)) {
      if (!rows) continue;
      const copy = structuredClone([...rows]) as object[];
      if ((SEED_COLLECTIONS as readonly string[]).includes(name)) {
        const target = sliced[name as SeedCollectionName] as object[];
        const existing = new Set(target.map(rowKey));
        for (const row of copy) {
          if (existing.has(rowKey(row))) {
            throw new Error(`overlay for ${appId} re-uses base ${name} id ${rowKey(row)}`);
          }
          target.push(row);
        }
      } else {
        (extraCollections[name] ??= []).push(...(copy as Array<{ id: string }>));
      }
    }
  }

  return { ...sliced, slice: { appId, personaId: slicePersona }, extraCollections };
}

function findPersona(seed: SeedDataset, id: PersonaId): DemoPersona {
  const persona = seed.personas.find((p) => p.id === id);
  if (!persona) throw new RangeError(`unknown persona ${id}`);
  return persona;
}

/** Keeps reference data (districts, facilities, personas, rulesets) and the patients' records. */
function byPatients(
  seed: SeedDataset,
  patientIds: ReadonlySet<string>,
  opts: { facilityIds: ReadonlySet<string> | null; releasedInstructionsOnly: boolean },
): SeedDataset {
  const has = (id: PatientId | null): boolean => id !== null && patientIds.has(id);
  const inFacility = (id: string | null): boolean =>
    opts.facilityIds !== null && id !== null && opts.facilityIds.has(id);
  return {
    ...seed,
    patients: seed.patients.filter((p) => has(p.id)),
    screenings: seed.screenings.filter((s) => has(s.patientId)),
    reviews: seed.reviews.filter((r) => has(r.patientId)),
    referrals: seed.referrals.filter((r) => has(r.patientId)),
    followUps: seed.followUps.filter((f) => has(f.patientId)),
    careTasks: seed.careTasks.filter((t) =>
      t.patientId !== null ? has(t.patientId) : inFacility(t.facilityId),
    ),
    reminders: seed.reminders.filter((r) => has(r.patientId)),
    reminderPreferences: seed.reminderPreferences.filter((r) => has(r.patientId)),
    careInstructions: seed.careInstructions.filter(
      (c) => has(c.patientId) && (!opts.releasedInstructionsOnly || c.status === "released"),
    ),
    auditEvents: seed.auditEvents.filter((e) =>
      e.patientId !== null ? has(e.patientId) : inFacility(e.facilityId),
    ),
    syncOperations: [],
  };
}
