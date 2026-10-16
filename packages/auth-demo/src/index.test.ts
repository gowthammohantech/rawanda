import { ROLES } from "@laif/domain";
import { enResources, rwResources } from "@laif/i18n";
import { describe, expect, it } from "vitest";

import * as api from "./index.ts";
import { PACKAGE, PERMISSIONS, permissionLabelKey, roleLabelKey } from "./index.ts";

function lookup(catalogue: object, dotted: string): unknown {
  let node: unknown = catalogue;
  for (const part of dotted.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

describe("@laif/auth-demo", () => {
  it("exports its package name and the public API", () => {
    expect(PACKAGE).toBe("@laif/auth-demo");
    for (const name of [
      "PERMISSIONS",
      "ROLE_PERMISSIONS",
      "checkAccess",
      "scopeForPersona",
      "isResourceInScope",
      "createPersonaSession",
      "requirePermission",
      "ForbiddenError",
      "revokeDeviceSession",
    ]) {
      expect(api).toHaveProperty(name);
    }
  });

  it("every permission and role has an EN and RW label (domain namespace)", () => {
    for (const [lng, res] of [
      ["en", enResources],
      ["rw", rwResources],
    ] as const) {
      for (const p of PERMISSIONS) {
        const key = permissionLabelKey(p).replace(/^domain:/, "");
        expect(typeof lookup(res.domain, key), `${lng} ${key}`).toBe("string");
      }
      for (const r of ROLES) {
        expect(typeof lookup(res.domain, roleLabelKey(r).replace(/^domain:/, ""))).toBe("string");
      }
      expect(typeof lookup(res.demo, "roleSwitchDisclaimer")).toBe("string");
    }
  });
});
