/**
 * Invented name syllables (FND-05 task 2). Curated so the composed names are not common real
 * Rwandan names: the syllables lean on letters Kinyarwanda does not use (q, x) and on unusual
 * clusters. Names from the existing prototype (`PrototypeFourApplications-main`) are never reused.
 * Patient names are not translated.
 */
import type { Prng } from "./prng.ts";

export const GIVEN_NAME_HEADS = [
  "Qua",
  "Xel",
  "Zor",
  "Vex",
  "Quil",
  "Oxa",
  "Tez",
  "Ixo",
  "Zeph",
  "Qor",
  "Xan",
  "Vaq",
] as const;
export const GIVEN_NAME_TAILS = ["rix", "vel", "qa", "zo", "xin", "lequ", "ra", "vox"] as const;

export const FAMILY_NAME_HEADS = [
  "Quor",
  "Xab",
  "Zelq",
  "Vorx",
  "Oqu",
  "Texa",
  "Ixal",
  "Qem",
  "Zuxo",
  "Varq",
] as const;
export const FAMILY_NAME_TAILS = [
  "andi",
  "ezo",
  "iqua",
  "oxe",
  "umbra",
  "elix",
  "arqo",
  "izu",
] as const;

/** Real-name denylist used by the privacy test (a few very common Rwandan / prototype names). */
export const REAL_NAME_DENYLIST = [
  "Uwase",
  "Mugisha",
  "Niyonzima",
  "Habimana",
  "Mukamana",
  "Ishimwe",
  "Keza",
  "Uwimana",
  "Nshimiyimana",
  "Hakizimana",
  "Ingabire",
  "Mutesi",
  "Aline",
  "Marie",
  "Diane",
  "Jean",
  "Claude",
  "Eric",
  "Grace",
  "Noël",
  "Noel",
] as const;

export function inventGivenName(prng: Prng): string {
  return prng.pick(GIVEN_NAME_HEADS) + prng.pick(GIVEN_NAME_TAILS);
}

export function inventFamilyName(prng: Prng): string {
  return prng.pick(FAMILY_NAME_HEADS) + prng.pick(FAMILY_NAME_TAILS);
}

/** `count` unique "Given Family" display names. */
export function inventUniqueNames(
  prng: Prng,
  count: number,
  taken: ReadonlySet<string> = new Set(),
): string[] {
  const seen = new Set(taken);
  const out: string[] = [];
  while (out.length < count) {
    const name = `${inventGivenName(prng)} ${inventFamilyName(prng)}`;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
