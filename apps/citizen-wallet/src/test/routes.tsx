/**
 * CTZ-09 route table for the route walks (DemoBanner, a11y, dynamic type, forbidden content):
 * every LEAF route module under `app/` (layouts excluded) with the persona it needs, its
 * router params / segments and a test id that only renders once its data is shown. The
 * completeness test (`routeWalk.test.tsx`) fails when a route file is added without an entry.
 */
import { CITIZEN_OVERLAY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import type { ComponentType } from "react";

import AccessHistoryRoute from "../../app/(app)/(tabs)/more/privacy/access-history.tsx";
import CorrectionDetailRoute from "../../app/(app)/(tabs)/more/privacy/corrections/[requestId].tsx";
import CorrectionListRoute from "../../app/(app)/(tabs)/more/privacy/corrections/index.tsx";
import CorrectionNewRoute from "../../app/(app)/(tabs)/more/privacy/corrections/new.tsx";
import PrivacyRoute from "../../app/(app)/(tabs)/more/privacy/index.tsx";
import PrivacyNoticeRoute from "../../app/(app)/(tabs)/more/privacy/notice.tsx";
import MoreAccessibilityRoute from "../../app/(app)/(tabs)/more/accessibility.tsx";
import MoreConsentRoute from "../../app/(app)/(tabs)/more/consent.tsx";
import MoreDemoToolsRoute from "../../app/(app)/(tabs)/more/demo-tools.tsx";
import MoreRoute from "../../app/(app)/(tabs)/more/index.tsx";
import CallbackRoute from "../../app/(app)/(tabs)/more/support/callback.tsx";
import MoreHelpRoute from "../../app/(app)/(tabs)/more/support/help.tsx";
import MoreSupportRoute from "../../app/(app)/(tabs)/more/support/index.tsx";
import ResultDetailRoute from "../../app/(app)/(tabs)/health/[observationId].tsx";
import HealthRoute from "../../app/(app)/(tabs)/health/index.tsx";
import NextStepDetailRoute from "../../app/(app)/(tabs)/next-steps/[instructionId].tsx";
import NextStepsRoute from "../../app/(app)/(tabs)/next-steps/index.tsx";
import RemindersRoute from "../../app/(app)/(tabs)/reminders/index.tsx";
import ReminderPrefsRoute from "../../app/(app)/(tabs)/reminders/preferences.tsx";
import TimelineRoute from "../../app/(app)/(tabs)/timeline/index.tsx";
import ConsentWithdrawnRoute from "../../app/(app)/consent-withdrawn.tsx";
import AboutDemoRoute from "../../app/(onboarding)/about-demo.tsx";
import OnboardingAccessibilityRoute from "../../app/(onboarding)/accessibility.tsx";
import ConsentRoute from "../../app/(onboarding)/consent.tsx";
import OnboardingDemoToolsRoute from "../../app/(onboarding)/demo-tools.tsx";
import PersonaRoute from "../../app/(onboarding)/persona.tsx";
import RecoverRoute from "../../app/(onboarding)/recover.tsx";
import OnboardingHelpRoute from "../../app/(onboarding)/support/help.tsx";
import OnboardingSupportRoute from "../../app/(onboarding)/support/index.tsx";
import VerifyRoute from "../../app/(onboarding)/verify.tsx";
import WelcomeRoute from "../../app/(onboarding)/welcome.tsx";
import NotFoundRoute from "../../app/+not-found.tsx";

/**
 * Who a route is rendered for: a fixed persona id, `"wallet"` (= the persona of the walk) or
 * nobody (`null`).
 */
export type RoutePersona = string | null;

export type RouteCase = {
  /** Route file under `app/` (completeness check). */
  route: string;
  Component: ComponentType;
  persona: RoutePersona;
  segments: string[];
  params?: Record<string, string>;
  /** Test id that renders once the screen's data is shown. */
  ready: string;
  /** Detail routes whose ids belong to CTZ-P1 (skipped for other walk personas). */
  p1Only?: boolean;
};

const tab = (...rest: string[]) => ["(app)", "(tabs)", ...rest];

export const P1_RESULT_ID = CITIZEN_OVERLAY_IDS.amendedScreening as string;
export const P1_STEP_ID = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId as string;
export const P1_REQUEST_ID = CITIZEN_OVERLAY_IDS.resolvedAmendedCorrection as string;

export const ROUTE_CASES: readonly RouteCase[] = [
  // Onboarding (no persona / onboarding personas).
  {
    route: "(onboarding)/welcome",
    Component: WelcomeRoute,
    persona: null,
    segments: ["(onboarding)", "welcome"],
    ready: "welcome-screen",
  },
  {
    route: "(onboarding)/persona",
    Component: PersonaRoute,
    persona: null,
    segments: ["(onboarding)", "persona"],
    ready: `persona-card-${PERSONA_IDS.citizen1}`,
  },
  {
    route: "(onboarding)/verify",
    Component: VerifyRoute,
    persona: PERSONA_IDS.citizenPending,
    segments: ["(onboarding)", "verify"],
    ready: "code-input",
  },
  {
    route: "(onboarding)/consent",
    Component: ConsentRoute,
    persona: PERSONA_IDS.citizenWithdrawn,
    segments: ["(onboarding)", "consent"],
    ready: "consent-give",
  },
  {
    route: "(onboarding)/recover",
    Component: RecoverRoute,
    persona: PERSONA_IDS.citizenPending,
    segments: ["(onboarding)", "recover"],
    ready: "recover-screen",
  },
  {
    route: "(onboarding)/about-demo",
    Component: AboutDemoRoute,
    persona: null,
    segments: ["(onboarding)", "about-demo"],
    ready: "about-demo-screen",
  },
  {
    route: "(onboarding)/accessibility",
    Component: OnboardingAccessibilityRoute,
    persona: null,
    segments: ["(onboarding)", "accessibility"],
    ready: "text-scale-options",
  },
  {
    route: "(onboarding)/demo-tools",
    Component: OnboardingDemoToolsRoute,
    persona: null,
    segments: ["(onboarding)", "demo-tools"],
    ready: "demo-clock",
  },
  {
    route: "(onboarding)/support/index",
    Component: OnboardingSupportRoute,
    persona: null,
    segments: ["(onboarding)", "support"],
    ready: "support-screen",
  },
  {
    route: "(onboarding)/support/help",
    Component: OnboardingHelpRoute,
    persona: null,
    segments: ["(onboarding)", "support", "help"],
    ready: "help-topics",
  },
  {
    route: "+not-found",
    Component: NotFoundRoute,
    persona: null,
    segments: ["+not-found"],
    ready: "not-found-screen",
  },
  {
    route: "(app)/consent-withdrawn",
    Component: ConsentWithdrawnRoute,
    persona: PERSONA_IDS.citizenWithdrawn,
    segments: ["(app)", "consent-withdrawn"],
    ready: "give-again",
  },
  // Wallet tabs (the walk persona: CTZ-P1 / P2 / P4).
  {
    route: "(app)/(tabs)/health/index",
    Component: HealthRoute,
    persona: "wallet",
    segments: tab("health"),
    ready: "results-list",
  },
  {
    route: "(app)/(tabs)/health/[observationId]",
    Component: ResultDetailRoute,
    persona: "wallet",
    segments: tab("health", "[observationId]"),
    params: { observationId: P1_RESULT_ID },
    ready: "result-detail",
    p1Only: true,
  },
  {
    route: "(app)/(tabs)/next-steps/index",
    Component: NextStepsRoute,
    persona: "wallet",
    segments: tab("next-steps"),
    ready: "section-upcoming",
  },
  {
    route: "(app)/(tabs)/next-steps/[instructionId]",
    Component: NextStepDetailRoute,
    persona: "wallet",
    segments: tab("next-steps", "[instructionId]"),
    params: { instructionId: P1_STEP_ID },
    ready: "instruction-detail",
    p1Only: true,
  },
  {
    route: "(app)/(tabs)/reminders/index",
    Component: RemindersRoute,
    persona: "wallet",
    segments: tab("reminders"),
    ready: "reminder-toggle-card",
  },
  {
    route: "(app)/(tabs)/reminders/preferences",
    Component: ReminderPrefsRoute,
    persona: "wallet",
    segments: tab("reminders", "preferences"),
    ready: "timing-selector",
  },
  {
    route: "(app)/(tabs)/timeline/index",
    Component: TimelineRoute,
    persona: "wallet",
    segments: tab("timeline"),
    ready: "timeline-list",
  },
  {
    route: "(app)/(tabs)/more/index",
    Component: MoreRoute,
    persona: "wallet",
    segments: tab("more"),
    ready: "more-consent",
  },
  {
    route: "(app)/(tabs)/more/accessibility",
    Component: MoreAccessibilityRoute,
    persona: "wallet",
    segments: tab("more", "accessibility"),
    ready: "text-scale-options",
  },
  {
    route: "(app)/(tabs)/more/consent",
    Component: MoreConsentRoute,
    persona: "wallet",
    segments: tab("more", "consent"),
    ready: "consent-state",
  },
  {
    route: "(app)/(tabs)/more/demo-tools",
    Component: MoreDemoToolsRoute,
    persona: "wallet",
    segments: tab("more", "demo-tools"),
    ready: "demo-clock",
  },
  {
    route: "(app)/(tabs)/more/privacy/index",
    Component: PrivacyRoute,
    persona: "wallet",
    segments: tab("more", "privacy"),
    ready: "privacy-latest-access",
  },
  {
    route: "(app)/(tabs)/more/privacy/notice",
    Component: PrivacyNoticeRoute,
    persona: "wallet",
    segments: tab("more", "privacy", "notice"),
    ready: "privacy-notice-body",
  },
  {
    route: "(app)/(tabs)/more/privacy/access-history",
    Component: AccessHistoryRoute,
    persona: "wallet",
    segments: tab("more", "privacy", "access-history"),
    ready: "access-list",
  },
  {
    route: "(app)/(tabs)/more/privacy/corrections/index",
    Component: CorrectionListRoute,
    persona: "wallet",
    segments: tab("more", "privacy", "corrections"),
    ready: "corrections-screen",
  },
  {
    route: "(app)/(tabs)/more/privacy/corrections/new",
    Component: CorrectionNewRoute,
    persona: "wallet",
    segments: tab("more", "privacy", "corrections", "new"),
    ready: "correction-picker",
  },
  {
    route: "(app)/(tabs)/more/privacy/corrections/[requestId]",
    Component: CorrectionDetailRoute,
    persona: "wallet",
    segments: tab("more", "privacy", "corrections", "[requestId]"),
    params: { requestId: P1_REQUEST_ID },
    ready: "correction-detail",
    p1Only: true,
  },
  {
    route: "(app)/(tabs)/more/support/index",
    Component: MoreSupportRoute,
    persona: "wallet",
    segments: tab("more", "support"),
    ready: "support-callback",
  },
  {
    route: "(app)/(tabs)/more/support/help",
    Component: MoreHelpRoute,
    persona: "wallet",
    segments: tab("more", "support", "help"),
    ready: "help-topics",
  },
  {
    route: "(app)/(tabs)/more/support/callback",
    Component: CallbackRoute,
    persona: "wallet",
    segments: tab("more", "support", "callback"),
    ready: "callback-form",
  },
];

/** Route files that only redirect (no screen of their own): `/` → the guard's target. */
export const REDIRECT_ONLY_ROUTES = ["index"] as const;

/** The wallet personas a route walk runs as (self, self with dismissed flag, representative). */
export const WALK_PERSONAS = [
  PERSONA_IDS.citizen1,
  PERSONA_IDS.citizen2,
  PERSONA_IDS.citizenRep,
] as const;

/** Route cases for one walk persona (P1-only detail ids skipped for the others). */
export function routesFor(walkPersona: string): RouteCase[] {
  return ROUTE_CASES.filter((r) => !(r.p1Only === true && walkPersona !== PERSONA_IDS.citizen1));
}

/** Concrete persona of a case in a walk. */
export function personaOf(route: RouteCase, walkPersona: string): string | null {
  return route.persona === "wallet" ? walkPersona : route.persona;
}
