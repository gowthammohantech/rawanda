/**
 * Maps Zod's built-in issues to `vMsg` keys so no English Zod default ever reaches the UI.
 *
 * Precedence (Zod 4): a message set on the schema/check wins, then a per-parse `error`, then
 * the global `customError` installed here, then Zod's English locale. Every custom message in
 * this package is already a `vMsg` string; this map covers the built-in issues.
 */
import { z } from "zod";

import { vMsg } from "./messages.ts";

type RawIssue = Parameters<z.core.$ZodErrorMap>[0];

const DATE_FORMATS: ReadonlySet<string> = new Set(["datetime", "date", "time", "duration"]);
const ID_FORMATS: ReadonlySet<string> = new Set([
  "uuid",
  "guid",
  "cuid",
  "cuid2",
  "ulid",
  "xid",
  "ksuid",
  "nanoid",
]);

function isMissing(input: unknown): boolean {
  return input === undefined || input === null;
}

function asNumber(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function discriminatorMissing(issue: RawIssue): boolean {
  const discriminator = issue["discriminator"];
  if (typeof discriminator !== "string") return false;
  const input = issue.input;
  if (typeof input !== "object" || input === null) return true;
  return isMissing((input as Record<string, unknown>)[discriminator]);
}

/** The contracts error map: returns a `vMsg` string for every issue code. */
export const contractsErrorMap: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case "invalid_type":
      if (isMissing(issue.input)) return vMsg("required");
      if (issue.expected === "int") return vMsg("integerRequired");
      return vMsg("invalidType");
    case "too_small": {
      const min = asNumber(issue.minimum);
      if (issue.origin === "string" || issue.origin === "array" || issue.origin === "set") {
        return min <= 1 ? vMsg("required") : vMsg("tooShort", { min });
      }
      if (issue.origin === "date") return vMsg("invalidDate");
      return vMsg("numberOutOfRange", { min });
    }
    case "too_big": {
      const max = asNumber(issue.maximum);
      if (issue.origin === "string" || issue.origin === "array" || issue.origin === "set") {
        return vMsg("tooLong", { max });
      }
      if (issue.origin === "date") return vMsg("invalidDate");
      return vMsg("numberOutOfRange", { max });
    }
    case "invalid_format":
      if (DATE_FORMATS.has(issue.format)) return vMsg("invalidDate");
      if (ID_FORMATS.has(issue.format)) return vMsg("invalidIdentifier");
      return vMsg("invalidFormat");
    case "not_multiple_of":
      return vMsg("invalidFormat");
    case "invalid_value":
      if (isMissing(issue.input)) return vMsg("required");
      return vMsg("invalidEnum");
    case "invalid_union":
      if (discriminatorMissing(issue)) return vMsg("required");
      return typeof issue["discriminator"] === "string" ? vMsg("invalidEnum") : vMsg("invalid");
    case "unrecognized_keys":
      return vMsg("unrecognizedKeys", { keys: issue.keys.join(",") });
    case "invalid_key":
    case "invalid_element":
    case "custom":
    default:
      return vMsg("invalid");
  }
};

/**
 * Installs `contractsErrorMap` as Zod's global `customError`. Call once at app start-up
 * (FND-04 / FND-11 shells); idempotent.
 */
export function installContractsErrorMap(): void {
  z.config({ customError: contractsErrorMap });
}
