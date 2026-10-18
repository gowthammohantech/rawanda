/**
 * CTZ-09 task 12 — final forbidden-content sweep: EVERY leaf route × the walk personas (self,
 * self with a dismissed flag, representative) × EN / RW renders no score, forecast, risk,
 * diagnosis, insurance, credit or eligibility wording (visible text AND accessible names), and
 * no id of an unapproved care instruction / unreleased referral appears anywhere in the render
 * tree (text, labels, test ids). The only allowed mentions are the three NEGATED disclaimers
 * ("never gives a diagnosis…"), which are stripped before scanning and asserted to be negations.
 */
import { enResources, rwResources, type Language } from "@laif/i18n";
import { createSeed, SEED_ANCHORS } from "@laif/mock-data";
import { walkAllRoutes } from "@laif/test-utils/native";
import { describe, expect, it, vi } from "vitest";

import { FORBIDDEN_COPY } from "../../features/health/__guards__/noScore.ts";
import { routesFor, WALK_PERSONAS } from "../../test/routes.tsx";
import { renderedText, renderRoute } from "../../test/walk.tsx";

vi.mock("expo-router", () => import("../../test/router-stub.tsx"));

/** CTZ-03 guard + CTZ-09 additions (insurance / credit / eligibility, any "diagnos…"). */
const FORBIDDEN: Record<Language, RegExp> = {
  en: new RegExp(`${FORBIDDEN_COPY.en.source}|diagnos|insurance|credit|eligib`, "iu"),
  rw: new RegExp(`${FORBIDDEN_COPY.rw.source}|ubwishingizi|inguzanyo|kwemererwa`, "iu"),
};

type Catalogue = {
  citizen: {
    onboarding: { about: { neverBody: string } };
    health: { notDiagnosis: string };
    consent: { noticeBody2: string };
  };
};
const catalogue: Record<Language, Catalogue> = {
  en: enResources,
  rw: rwResources as unknown as Catalogue,
};

/** The negated disclaimers — the only place such words may appear. */
function allowedDisclaimers(language: Language): string[] {
  const c = catalogue[language].citizen;
  return [c.onboarding.about.neverBody, c.health.notDiagnosis, c.consent.noticeBody2];
}

const NEGATION: Record<Language, RegExp> = { en: /\b(never|not)\b/iu, rw: /\bnti|\bsi\b|nta/iu };

/** Ids that must never reach the wallet: unreleased / withdrawn instructions + their sources. */
function unapprovedIds(): string[] {
  const seed = createSeed();
  const ids = new Set<string>([
    SEED_ANCHORS.CTZ_P1_UNRELEASED_REFERRAL.referralId,
    SEED_ANCHORS.CTZ_P2_WITHDRAWN_INSTRUCTION.careInstructionId,
  ]);
  for (const instruction of seed.careInstructions) {
    if (instruction.status !== "released") ids.add(instruction.id);
  }
  return [...ids];
}

describe("forbidden-content guard", () => {
  it.each(["en", "rw"] as const)(
    "disclaimers (%s) are negations and the pattern is live",
    (lng) => {
      for (const text of allowedDisclaimers(lng)) expect(text).toMatch(NEGATION[lng]);
      expect("Your health score is 80%").toMatch(FORBIDDEN.en);
      expect("Used for insurance decisions").toMatch(FORBIDDEN.en);
      expect("Amanota yawe").toMatch(FORBIDDEN.rw);
    },
  );
});

const UNAPPROVED = unapprovedIds();

describe.each(["en", "rw"] as const)("every route (%s)", (language) => {
  it.each(WALK_PERSONAS)(
    "%s: no forbidden wording, no unapproved instruction id",
    async (walkPersona) => {
      expect(UNAPPROVED.length).toBeGreaterThan(1);
      await walkAllRoutes(routesFor(walkPersona), async (route) => {
        const view = await renderRoute(route, walkPersona, { language });
        let text = renderedText(document.body);
        for (const allowed of allowedDisclaimers(language)) text = text.split(allowed).join("");
        const match = FORBIDDEN[language].exec(text);
        expect(
          match === null ? null : text.slice(Math.max(0, match.index - 40), match.index + 40),
          `${route.route}: forbidden wording`,
        ).toBeNull();
        const tree = view.container.innerHTML;
        for (const id of UNAPPROVED) expect(tree.includes(id), `${route.route}: ${id}`).toBe(false);
      });
    },
    120_000,
  );
});
