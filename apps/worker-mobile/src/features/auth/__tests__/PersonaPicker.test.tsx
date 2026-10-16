import { rwResources } from "@laif/i18n";
import { PERSONA_IDS } from "@laif/mock-data";
import { renderNative } from "@laif/test-utils/native";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createSessionStore } from "../../../session/store.ts";
import { PersonaPicker } from "../PersonaPicker.tsx";
import { createMemoryStorage } from "@laif/auth-demo";

const RW_AUTH = (rwResources.worker as { auth: Record<string, unknown> }).auth as {
  title: string;
  continue: string;
  demoPill: string;
};

const personas = createSessionStore(createMemoryStorage()).available();

describe("PersonaPicker (HWM-01)", () => {
  it("lists the worker personas with role, facility, district and a DEMO SIGN-IN pill", () => {
    renderNative(<PersonaPicker personas={personas} onContinue={() => undefined} />);
    expect(personas.map((p) => p.id)).toEqual([
      PERSONA_IDS.chwAlpha1A,
      PERSONA_IDS.chwAlpha1B,
      PERSONA_IDS.chwAlpha2A,
      PERSONA_IDS.chwBeta1A,
      PERSONA_IDS.supAlpha,
    ]);
    const card = screen.getByTestId(`persona-card-${PERSONA_IDS.chwAlpha1A}`);
    expect(within(card).getByText("Oxavel Oquumbra")).toBeTruthy();
    expect(within(card).getByText("Community health worker")).toBeTruthy();
    expect(within(card).getByText("Demo Health Centre Alpha-1")).toBeTruthy();
    expect(within(card).getByText("Demo District Alpha")).toBeTruthy();
    expect(screen.getAllByText("Demo sign-in")).toHaveLength(personas.length);
    expect(
      screen.getByText("Role selection is a demonstration only and is not security.", {
        exact: false,
      }),
    ).toBeTruthy();
  });

  it("Continue is disabled until a card is chosen, then passes the persona id", () => {
    const onContinue = vi.fn();
    renderNative(<PersonaPicker personas={personas} onContinue={onContinue} />);
    const button = screen.getByTestId("persona-continue");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByTestId(`persona-card-${PERSONA_IDS.supAlpha}`));
    expect(
      screen.getByTestId(`persona-card-${PERSONA_IDS.supAlpha}`).getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(screen.getByTestId("persona-continue"));
    expect(onContinue).toHaveBeenCalledWith(PERSONA_IDS.supAlpha);
  });

  it("EN → RW switch changes the labels", async () => {
    const { i18n } = renderNative(
      <PersonaPicker personas={personas} onContinue={() => undefined} />,
    );
    expect(screen.getByText("Choose your demo profile")).toBeTruthy();
    await act(async () => {
      await i18n.setLanguage("rw");
    });
    expect(screen.getByText(RW_AUTH.title)).toBeTruthy();
    expect(screen.getByText(RW_AUTH.continue)).toBeTruthy();
    expect(screen.getAllByText(RW_AUTH.demoPill)).toHaveLength(personas.length);
    expect(screen.queryByText("Choose your demo profile")).toBeNull();
  });

  it("no eligible personas → developer-error EmptyState", () => {
    renderNative(<PersonaPicker personas={[]} onContinue={() => undefined} />);
    expect(screen.getByText("No demo worker personas in seed")).toBeTruthy();
  });
});
