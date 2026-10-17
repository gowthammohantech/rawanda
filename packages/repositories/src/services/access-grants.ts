/**
 * Programme Admin AccessGrants (ADM-01; ADM-08 adds edits). A grant is the reporting scope of an
 * admin persona; FND-06 `scopeForPersona(persona, grant)` turns it into the actor scope.
 *
 * `listAccessGrants` needs no permission: the demo sign-in lists every persona's scope before a
 * session exists, and grants hold no patient data. DEMO ROLE SWITCH — NOT AUTHENTICATION.
 */
import { AccessGrantSchema, type AccessGrant } from "@laif/contracts";

import type { Engine } from "../core/engine.ts";

export function createAccessGrantService(engine: Engine) {
  return {
    listAccessGrants(): Promise<AccessGrant[]> {
      return engine.read(async (ctx) =>
        (await ctx.tx.getAll<unknown>("accessGrants"))
          .map((row) => AccessGrantSchema.parse(row))
          .sort((a, b) => (a.personaId < b.personaId ? -1 : a.personaId > b.personaId ? 1 : 0)),
      );
    },
  };
}
