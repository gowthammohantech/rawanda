/**
 * Programme Admin AccessGrants (ADM-01; ADM-08 edits) and the demo ruleset history (ADM-08).
 * A grant is the reporting scope (and role) of an admin persona; FND-06 `scopeForPersona(persona,
 * grant)` turns it into the actor scope.
 *
 * - `listAccessGrants` needs no permission: the demo sign-in lists every persona's scope before a
 *   session exists, and grants hold no patient data.
 * - `updateAccessGrant(input, key)` — `roles.configure` (non-admin → `access.denied`, entityType
 *   `access_grant`). Idempotent on the key; `expectedVersion` inside the input (FND-07
 *   convention): mismatch → `CONFLICT` with `latest` (+ `conflict.detected`). Rules: (a) the
 *   editor cannot remove `roles.configure` from their own grant and at least one active
 *   `roles.configure` grant must remain (`FORBIDDEN` reason `LAST_ADMIN`, audited as
 *   `access.denied`); (b) the scope is non-empty and every facility lies in a selected district;
 *   (c) the role is one of the four demo admin roles. Grants are never deleted — `revoke: true`
 *   sets `validTo` to the demo now (`admin.access_grant.revoked`); every other edit writes
 *   `admin.access_grant.changed` with before/after, justification and version n → n+1.
 * - `listRulesets()` — `metrics.read`: every stored demo ruleset, newest first, with the
 *   history metadata (`DEMO_RULESET_HISTORY`); thresholds are never returned.
 *
 * DEMO ROLE SWITCH — NOT AUTHENTICATION.
 */
import { isGrantExpired, roleHasPermission } from "@laif/auth-demo";
import {
  AccessGrantSchema,
  ALL_IN_DISTRICTS,
  createAccessGrantUpdateInputSchema,
  type AccessGrant,
  type AccessGrantUpdateInputSchema,
  type RulesetHistoryEntry,
  type WriteResult,
} from "@laif/contracts";
import type { DemoRuleset, JsonValue } from "@laif/domain";
import { DEMO_RULESET_HISTORY } from "@laif/mock-data";

import type { MutationInput } from "../care-repository.ts";
import type { Engine, TxContext } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";

export type AccessGrantUpdateCall = MutationInput<typeof AccessGrantUpdateInputSchema>;

const ENTITY = "access_grant" as const;

function byPersona(a: AccessGrant, b: AccessGrant): number {
  return a.personaId < b.personaId ? -1 : a.personaId > b.personaId ? 1 : 0;
}

async function allGrants(ctx: TxContext): Promise<AccessGrant[]> {
  return (await ctx.tx.getAll<unknown>("accessGrants"))
    .map((row) => AccessGrantSchema.parse(row))
    .sort(byPersona);
}

/** The fields an edit can change (audit before / after; never patient data). */
function grantSummary(grant: AccessGrant): { [key: string]: JsonValue } {
  return {
    role: grant.role,
    districtIds: [...grant.districtIds],
    facilityIds: grant.facilityIds === ALL_IN_DISTRICTS ? ALL_IN_DISTRICTS : [...grant.facilityIds],
    validTo: grant.validTo ?? null,
  };
}

const holdsAdmin = (grant: AccessGrant, now: Date): boolean =>
  roleHasPermission(grant.role, "roles.configure") && !isGrantExpired(grant, now);

export function createAccessGrantService(engine: Engine) {
  return {
    listAccessGrants(): Promise<AccessGrant[]> {
      return engine.read(allGrants);
    },

    listRulesets(): Promise<RulesetHistoryEntry[]> {
      return engine.read(async (ctx) => {
        ctx.authorize("metrics.read", undefined, { entityType: "ruleset", entityId: "history" });
        const rows = await ctx.tx.getAll<DemoRuleset & { id?: string }>("rulesets");
        return rows
          .map((r): RulesetHistoryEntry => {
            const meta = DEMO_RULESET_HISTORY[r.version];
            return {
              version: r.version,
              status: r.status === "active" ? "active" : "retired",
              effectiveFrom: r.effectiveFrom,
              effectiveTo: r.effectiveTo ?? null,
              changedBy: meta?.changedBy ?? "demo_configuration",
              changeSummaryKey: meta?.changeSummaryKey ?? "unknown",
              reasonCodes: [...(meta?.reasonCodes ?? [])],
              label: r.label,
              approvedBy: null,
            };
          })
          .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
      });
    },

    updateAccessGrant(i: AccessGrantUpdateCall, key: string): Promise<WriteResult<AccessGrant>> {
      return engine.mutate({
        op: "updateAccessGrant",
        key,
        input: i,
        entityType: ENTITY,
        permission: "roles.configure",
        schema: (ctx) =>
          Promise.resolve(createAccessGrantUpdateInputSchema({ now: () => ctx.now })),
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const row = await ctx.find<unknown>(ENTITY, input.id);
          if (row === undefined) {
            throw new RepositoryError("NOT_FOUND", {
              details: { entityType: ENTITY, entityId: input.id },
            });
          }
          const grant = AccessGrantSchema.parse(row);
          ctx.useCorrelation(input.correlationId ?? null);
          await ctx.assertVersion(ENTITY, grant, input.expectedVersion);

          // Rule (b): known districts; every listed facility inside a selected district.
          const districts = new Set(
            (await ctx.tx.getAll<{ id: string }>("districts")).map((d) => d.id),
          );
          const unknownDistrict = input.districtIds.some((d) => !districts.has(d));
          const facilitiesOutside =
            input.facilityIds !== ALL_IN_DISTRICTS &&
            input.facilityIds.some((id) => {
              const district = ctx.facilityToDistrict[id];
              return district === undefined || !input.districtIds.includes(district);
            });
          if (unknownDistrict || facilitiesOutside) {
            throw new RepositoryError("VALIDATION_ERROR", {
              fieldErrors: {
                ...(unknownDistrict ? { districtIds: { key: "invalid", params: {} } } : {}),
                ...(facilitiesOutside ? { facilityIds: { key: "invalid", params: {} } } : {}),
              },
            });
          }

          const revoke = input.revoke === true;
          const validTo = revoke ? ctx.nowIso : (input.validTo ?? null);
          const { validTo: _previous, ...rest } = grant;
          void _previous;
          const next: AccessGrant = AccessGrantSchema.parse({
            ...ctx.touch(rest, {
              role: input.role,
              districtIds: [...input.districtIds],
              facilityIds:
                input.facilityIds === ALL_IN_DISTRICTS ? ALL_IN_DISTRICTS : [...input.facilityIds],
              updatedBy: actor.personaId,
            }),
            ...(validTo === null ? {} : { validTo }),
          });

          // Rule (a): lockout prevention.
          const ownAdminRemoved = grant.personaId === actor.personaId && !holdsAdmin(next, ctx.now);
          const remaining = (await allGrants(ctx))
            .map((g) => (g.id === next.id ? next : g))
            .filter((g) => holdsAdmin(g, ctx.now));
          if (ownAdminRemoved || remaining.length === 0) {
            ctx.deny(
              "LAST_ADMIN",
              { entityType: ENTITY, entityId: grant.id },
              {},
              {
                permission: "roles.configure",
                rule: "LAST_ADMIN",
                ownGrant: grant.personaId === actor.personaId,
                requestedRole: input.role,
                revoke,
              },
            );
          }

          await ctx.save(ENTITY, next);
          const event = await ctx.audit({
            action: revoke ? "admin.access_grant.revoked" : "admin.access_grant.changed",
            entityType: ENTITY,
            entityId: grant.id,
            facilityId: null,
            districtId: null,
            before: grant,
            after: next,
            changeSummary: {
              personaId: grant.personaId,
              before: grantSummary(grant),
              after: grantSummary(next),
              fromVersion: grant.version,
              toVersion: next.version,
              revoked: revoke,
            },
            justification: input.justification,
          });
          return { data: next, entityType: ENTITY, auditEventId: event.id, sync: null };
        },
      });
    },
  };
}
