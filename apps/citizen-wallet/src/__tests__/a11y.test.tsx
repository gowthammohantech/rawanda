/** CTZ-02/03: every pressable on the onboarding / wallet screens has a role, a label and ≥ 44 × 44. */
import { minTouchTarget } from "@laif/ui-native";
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WalletHeader } from "../components/WalletHeader.tsx";
import { HealthListScreen } from "../features/health/HealthListScreen.tsx";
import { ResultDetailScreen } from "../features/health/ResultDetailScreen.tsx";
import { DemoToolsScreen } from "../screens/DemoToolsScreen.tsx";
import { ConsentScreen } from "../screens/onboarding/ConsentScreen.tsx";
import { PersonaScreen } from "../screens/onboarding/PersonaScreen.tsx";
import { VerifyScreen } from "../screens/onboarding/VerifyScreen.tsx";
import { WelcomeScreen } from "../screens/onboarding/WelcomeScreen.tsx";
import { ConsentWithdrawnScreen } from "../screens/wallet/ConsentWithdrawnScreen.tsx";
import { MoreScreen } from "../screens/wallet/MoreScreen.tsx";
import { renderShell } from "../test/harness.tsx";

vi.mock("expo-router", () => import("../test/router-stub.tsx"));

const ROLES = ["button", "checkbox", "radio", "switch", "link"] as const;
const px = (v: string) => (Number.isNaN(parseFloat(v)) ? 0 : parseFloat(v));

function expectTargets() {
  const elements = ROLES.flatMap((role) => screen.queryAllByRole(role));
  expect(elements.length).toBeGreaterThan(0);
  for (const element of elements) {
    const label = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim();
    expect(label, element.outerHTML.slice(0, 120)).not.toBe("");
    const style = getComputedStyle(element);
    expect(Math.max(px(style.minWidth), px(style.width)), label).toBeGreaterThanOrEqual(
      minTouchTarget,
    );
    expect(Math.max(px(style.minHeight), px(style.height)), label).toBeGreaterThanOrEqual(
      minTouchTarget,
    );
  }
}

const cases: [string, ReactNode, string | null, string][] = [
  ["welcome", <WelcomeScreen key="w" />, null, "welcome-screen"],
  ["persona", <PersonaScreen key="p" />, null, `persona-card-${PERSONA_IDS.citizen1}`],
  ["verify", <VerifyScreen key="v" />, PERSONA_IDS.citizenPending, "code-input"],
  ["consent", <ConsentScreen key="c" />, PERSONA_IDS.citizenWithdrawn, "consent-give"],
  ["withdrawn", <ConsentWithdrawnScreen key="cw" />, PERSONA_IDS.citizenWithdrawn, "give-again"],
  ["more", <MoreScreen key="m" />, PERSONA_IDS.citizen1, "more-consent"],
  ["header", <WalletHeader key="h" title="My health" />, PERSONA_IDS.citizen1, "wallet-menu"],
  ["demo tools", <DemoToolsScreen key="d" />, null, "demo-reset"],
  ["my health", <HealthListScreen key="hl" />, PERSONA_IDS.citizen2, "results-list"],
  [
    "result detail",
    <ResultDetailScreen
      key="rd"
      observationId={SEED_ANCHORS.CTZ_P2_DISMISSED_SCREENING.screeningId}
    />,
    PERSONA_IDS.citizen2,
    "result-detail",
  ],
];

describe("touch targets and labels", () => {
  it.each(cases)("%s", async (_name, node, personaId, readyTestId) => {
    await renderShell(node, {
      readyTestId,
      before: (s) => {
        if (personaId !== null) s.session.switchTo(personaId);
      },
    });
    expectTargets();
  });
});
