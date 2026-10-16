/**
 * CLN-01 task 5: persona cards + facility select limited to the persona's permitted facilities,
 * inline validation with focus on the first error, `session.started`, `?redirect=` handling.
 */
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { auditEvents, renderApp } from "../../../test/render-app.tsx";

const card = (id: string) => screen.getByTestId(`persona-card-${id}`);
const facilitySelect = () =>
  screen.getByRole<HTMLSelectElement>("combobox", { name: /Active facility/ });
const optionValues = () =>
  within(facilitySelect())
    .getAllByRole("option")
    .map((option) => (option as HTMLOptionElement).value)
    .filter((value) => value !== "");

describe("LoginPage", () => {
  it("shows the four clinical personas, nothing preselected, focus on the first card", async () => {
    await renderApp();
    expect(screen.getByRole("heading", { level: 1, name: "Demo access" })).toBeTruthy();
    expect(screen.getByTestId("demo-banner")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("not authentication");
    expect(screen.getByText(/Demo only — not authentication/)).toBeTruthy();
    const cards = screen
      .getAllByRole("button", { pressed: false })
      .filter((button) => button.dataset["testid"]?.startsWith("persona-card-"));
    expect(cards.map((button) => button.dataset["testid"])).toEqual([
      `persona-card-${PERSONA_IDS.clinAlpha1}`,
      `persona-card-${PERSONA_IDS.nurseAlpha2}`,
      `persona-card-${PERSONA_IDS.coordAlpha}`,
      `persona-card-${PERSONA_IDS.clinBeta1}`,
    ]);
    expect(card(PERSONA_IDS.coordAlpha).textContent).toContain("Facility coordinator");
    expect(card(PERSONA_IDS.coordAlpha).textContent).toContain("Demo persona");
    await waitFor(() => expect(document.activeElement).toBe(card(PERSONA_IDS.clinAlpha1)));
    expect(facilitySelect().value).toBe("");
    expect(optionValues()).toEqual([]);
    expect(document.title).toBe("Demo access · CareConnect Clinical Portal (Demo)");
  });

  it("limits the facility select to the persona's permitted facilities", async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(card(PERSONA_IDS.coordAlpha));
    expect(card(PERSONA_IDS.coordAlpha).getAttribute("aria-pressed")).toBe("true");
    expect(optionValues()).toEqual([FACILITY_IDS.alpha1, FACILITY_IDS.alpha2]);
    expect(facilitySelect().value).toBe("");

    await user.click(card(PERSONA_IDS.clinBeta1));
    expect(optionValues()).toEqual([FACILITY_IDS.beta1]);
    expect(facilitySelect().value).toBe(FACILITY_IDS.beta1); // single facility preselected
  });

  it("shows inline errors and moves focus to the first error", async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole("button", { name: "Enter the clinical portal" }));
    expect(screen.getByText("Choose a demo persona.")).toBeTruthy();
    expect(document.activeElement).toBe(card(PERSONA_IDS.clinAlpha1));

    await user.click(card(PERSONA_IDS.coordAlpha));
    expect(screen.queryByText("Choose a demo persona.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Enter the clinical portal" }));
    expect(facilitySelect().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(facilitySelect());
  });

  it("Enter on a focused card selects it; submit signs in, audits and lands on the queue", async () => {
    const user = userEvent.setup();
    const { router, store, services } = await renderApp();
    await waitFor(() => expect(document.activeElement).toBe(card(PERSONA_IDS.clinAlpha1)));
    await user.keyboard("{Enter}");
    expect(card(PERSONA_IDS.clinAlpha1).getAttribute("aria-pressed")).toBe("true");
    expect(facilitySelect().value).toBe(FACILITY_IDS.alpha1);
    await user.click(screen.getByRole("button", { name: "Enter the clinical portal" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/clinical/queue"));
    expect(await screen.findByTestId("app-shell")).toBeTruthy();
    expect(services.session.state()).toMatchObject({
      persona: { id: PERSONA_IDS.clinAlpha1 },
      activeFacilityId: FACILITY_IDS.alpha1,
    });
    const started = await auditEvents(store, "session.started");
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      actorId: PERSONA_IDS.clinAlpha1,
      actorRole: "clinician",
      facilityId: FACILITY_IDS.alpha1,
    });
    expect(started[0]?.correlationId).toBeTruthy();
  });

  it("follows a safe ?redirect= and ignores an external one", async () => {
    const user = userEvent.setup();
    const first = await renderApp({
      path: "/clinical/login?redirect=%2Fclinical%2Fpatients%3Fq%3Dabc",
    });
    await user.click(card(PERSONA_IDS.coordAlpha));
    await user.selectOptions(facilitySelect(), FACILITY_IDS.alpha2);
    await user.click(screen.getByRole("button", { name: "Enter the clinical portal" }));
    await waitFor(() => expect(first.router.state.location.pathname).toBe("/clinical/patients"));
    expect(first.router.state.location.search).toBe("?q=abc");
    first.unmount();
    window.localStorage.clear();

    const second = await renderApp({ path: "/clinical/login?redirect=https%3A%2F%2Fevil.test" });
    await user.click(card(PERSONA_IDS.clinBeta1));
    await user.click(screen.getByRole("button", { name: "Enter the clinical portal" }));
    await waitFor(() => expect(second.router.state.location.pathname).toBe("/clinical/queue"));
  });
});
