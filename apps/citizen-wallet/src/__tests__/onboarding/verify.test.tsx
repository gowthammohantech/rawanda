/**
 * CTZ-02 simulated verification (CTZ-P5): translated validation, wrong-code attempts + lockout,
 * the unavailable fault never verifies (T-07) and a retry reuses the idempotency key (T-09).
 */
import { PERSONA_IDS } from "@laif/mock-data";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VerifyScreen } from "../../screens/onboarding/VerifyScreen.tsx";
import { auditsOf, renderShell } from "../../test/harness.tsx";
import { lastHref, resetRouter } from "../../test/router-stub.tsx";

vi.mock("expo-router", () => import("../../test/router-stub.tsx"));

const signInPending = {
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(PERSONA_IDS.citizenPending),
  readyTestId: "code-input",
};

function enterCode(code: string) {
  fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: code } });
}

const submit = () => fireEvent.click(screen.getByTestId("verify-submit"));

describe("verify", () => {
  beforeEach(() => resetRouter());

  it("shows the labelled demo code, one labelled box per digit and a translated field error", async () => {
    await renderShell(<VerifyScreen />, signInPending);
    for (let n = 1; n <= 6; n += 1) expect(screen.getByLabelText(`Digit ${n} of 6`)).toBeTruthy();
    expect(screen.getByTestId("demo-code-hint").textContent).toContain("246810");
    enterCode("123");
    submit();
    expect(await screen.findByText("Enter the 6 numbers")).toBeTruthy();
  });

  it("a wrong code is a recorded attempt with an inline error; the demo code verifies", async () => {
    const { store } = await renderShell(<VerifyScreen />, signInPending);
    enterCode("111111");
    submit();
    expect(await screen.findByText("That code is not right. 4 attempts left.")).toBeTruthy();
    expect(await auditsOf(store, "citizen.identity.verification_failed")).toHaveLength(1);
    enterCode("246810");
    submit();
    await waitFor(() => expect(lastHref()).toBe("/consent"));
    expect(await auditsOf(store, "citizen.identity.verified")).toHaveLength(1);
  });

  it("locks after five wrong codes and goes to the recovery stub", async () => {
    const { repo } = await renderShell(<VerifyScreen />, signInPending);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      enterCode("000000");
      submit();
      if (attempt < 5) {
        await screen.findByText(`That code is not right. ${5 - attempt} attempts left.`);
      }
    }
    await waitFor(() => expect(lastHref()).toBe("/recover"));
    expect((await repo().getSession())?.account?.status).toBe("locked");
  });

  it("unavailable fault: ErrorState, nothing verified; retry reuses the key and verifies once", async () => {
    const { repo, store } = await renderShell(<VerifyScreen />, signInPending);
    await repo().demo.setFaults({ dependencyUnavailableRate: 1 });
    enterCode("246810");
    submit();
    expect(
      await screen.findByText(
        "Verification service is not available right now. Nothing was changed. Try again later.",
      ),
    ).toBeTruthy();
    expect(await auditsOf(store, "citizen.identity.verification_unavailable")).toHaveLength(1);
    expect(await auditsOf(store, "citizen.identity.verified")).toHaveLength(0);
    await repo().demo.setFaults({ dependencyUnavailableRate: 0 });
    expect((await repo().getSession())?.verification?.status).toBe("pending");

    // The answer is lost after the commit ("did it save?"): the retry must replay, not re-run.
    await repo().demo.setFaults({ timeoutRate: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("The code could not be checked. Nothing was changed. Try again.");
    await repo().demo.setFaults({ timeoutRate: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(lastHref()).toBe("/consent"));
    expect(await auditsOf(store, "citizen.identity.verified")).toHaveLength(1);
    expect(await auditsOf(store, "citizen.identity.verification_attempted")).toHaveLength(1);
    expect(await auditsOf(store, "sync.duplicate_suppressed")).toHaveLength(1);
  });
});
