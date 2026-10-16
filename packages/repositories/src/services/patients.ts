/** Patients: search, record (audited read), registration and identity matching (HWM-04). */
import {
  PatientFilterSchema,
  RegisterPatientInputSchema,
  type Page,
  type RegisterPatientInput,
  type WriteResult,
} from "@laif/contracts";
import {
  asId,
  PATIENT_MATCH_THRESHOLD,
  scorePatientMatch,
  type Patient,
  type PatientId,
} from "@laif/domain";

import type { PatientMatch, PatientFilterInput, RegisterPatientCall } from "../care-repository.ts";
import type { Engine, TxContext } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import {
  assertRequestedScope,
  paginate,
  parseFilter,
  patientResource,
  READ_PERMISSIONS,
  readPermission,
  sortBy,
} from "./shared.ts";

/** Candidates below this score are not shown at all. */
export const PATIENT_MATCH_MIN_SCORE = 0.5;
const PLACEHOLDER_KEY = "00000000-0000-4000-8000-000000000000";

export function displayNameOf(i: Pick<RegisterPatientInput, "givenName" | "familyName">): string {
  return `${i.givenName} ${i.familyName}`.replace(/\s+/gu, " ").trim();
}

async function scopedPatients(ctx: TxContext): Promise<Patient[]> {
  const permission = readPermission(ctx, READ_PERMISSIONS.patient, {
    entityType: "patient",
    entityId: "list",
  });
  return (await ctx.all<Patient>("patient")).filter((p) => ctx.can(permission, patientResource(p)));
}

function matchesOf(
  ctx: TxContext,
  input: RegisterPatientInput,
  patients: Patient[],
): PatientMatch[] {
  const candidate = {
    name: displayNameOf(input),
    dateOfBirth: input.dateOfBirth ?? null,
    estimatedAgeYears: input.estimatedAgeYears,
    sex: input.sex,
  };
  return patients
    .map((patient) => ({ patient, score: scorePatientMatch(candidate, patient, ctx.now) }))
    .filter((m) => m.score >= PATIENT_MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score || (a.patient.id < b.patient.id ? -1 : 1));
}

export function createPatientService(engine: Engine) {
  return {
    listPatients(f?: PatientFilterInput): Promise<Page<Patient>> {
      return engine.read(async (ctx) => {
        const filter = parseFilter(PatientFilterSchema, f);
        const permission = readPermission(ctx, READ_PERMISSIONS.patient, {
          entityType: "patient",
          entityId: "list",
        });
        assertRequestedScope(ctx, permission, filter);
        const q = filter.q?.toLowerCase();
        const rows = (await scopedPatients(ctx)).filter(
          (p) =>
            (!filter.facilityIds || (filter.facilityIds as string[]).includes(p.facilityId)) &&
            (!filter.districtIds || (filter.districtIds as string[]).includes(p.districtId)) &&
            (!q ||
              p.displayName.toLowerCase().includes(q) ||
              p.syntheticIdentifier.toLowerCase().includes(q)),
        );
        return paginate(
          sortBy(rows, (p) => p.displayName),
          filter.page,
          filter.pageSize,
        );
      });
    },

    getPatient(id: string): Promise<Patient | null> {
      return engine.read(async (ctx) => {
        const permission = readPermission(ctx, READ_PERMISSIONS.patient, {
          entityType: "patient",
          entityId: id,
        });
        const patient = await ctx.find<Patient>("patient", id);
        if (!patient) return null;
        ctx.authorize(permission, patientResource(patient), {
          entityType: "patient",
          entityId: id,
        });
        await ctx.auditAccess({
          action: "patient.viewed",
          entityType: "patient",
          entityId: id,
          after: patient,
        });
        return patient;
      });
    },

    findPatientMatches(i: RegisterPatientCall): Promise<PatientMatch[]> {
      return engine.read(async (ctx) => {
        ctx.authorize("patient.register", undefined, { entityType: "patient", entityId: "match" });
        const input = parseFilter(RegisterPatientInputSchema, {
          ...i,
          idempotencyKey: i.idempotencyKey ?? PLACEHOLDER_KEY,
        });
        return matchesOf(ctx, input, await scopedPatients(ctx));
      });
    },

    registerPatient(
      i: RegisterPatientCall,
      key: string,
      options: { presetId?: string } = {},
    ): Promise<WriteResult<Patient>> {
      return engine.mutate({
        op: "registerPatient",
        key,
        input: i,
        entityType: "patient",
        permission: "patient.register",
        schema: RegisterPatientInputSchema,
        run: async (ctx, input) => {
          const facility = ctx.facilities.find((f) => f.id === input.facilityId);
          if (!facility) {
            throw new RepositoryError("VALIDATION_ERROR", {
              fieldErrors: { facilityId: { key: "invalid", params: {} } },
            });
          }
          ctx.authorize(
            "patient.register",
            { facilityId: facility.id, districtId: facility.districtId },
            { entityType: "patient", entityId: options.presetId ?? "new" },
          );
          const id = asId<PatientId>(options.presetId ?? ctx.ids());
          const flagged = input.matchDecision === "register_anyway_flagged";
          const candidates = flagged
            ? matchesOf(ctx, input, await scopedPatients(ctx))
                .filter((m) => m.score >= PATIENT_MATCH_THRESHOLD)
                .map((m) => m.patient.id)
            : [];
          const patient: Patient = {
            id,
            syntheticIdentifier: `DEMO-R-${id
              .replace(/[^A-Za-z0-9]/gu, "")
              .slice(0, 8)
              .toUpperCase()}`,
            displayName: displayNameOf(input),
            dateOfBirth: input.dateOfBirth ?? null,
            sexOptional: input.sex,
            facilityId: facility.id,
            districtId: facility.districtId,
            consentState: "not_recorded",
            identityStatus: flagged ? "needs_match_review" : "unverified",
            duplicateCandidateIds: candidates,
            preferredLanguage: "rw",
            ...ctx.created(),
          };
          if (input.estimatedAgeYears !== undefined)
            patient.estimatedAgeYears = input.estimatedAgeYears;
          await ctx.save("patient", patient);
          ctx.useCorrelation(null);
          const event = await ctx.audit({
            action: "patient.registered",
            entityType: "patient",
            entityId: id,
            after: patient,
            changeSummary: { identityStatus: patient.identityStatus },
          });
          if (flagged) {
            await ctx.audit({
              action: "patient.match_flagged",
              entityType: "patient",
              entityId: id,
              after: patient,
              changeSummary: { candidates: candidates.length },
            });
          }
          return {
            data: patient,
            entityType: "patient",
            auditEventId: event.id,
            sync: { entityType: "patient", entityId: id, opType: "create" },
          };
        },
      });
    },
  };
}
