/**
 * CLN-03 / FRD T-07: the national-identity check is not connected in the demo — the simulated
 * adapter rejects with DEPENDENCY_UNAVAILABLE, the UI says so, and nothing is created.
 */
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { isRepositoryError } from "@laif/repositories";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { routes } from "../../../app/routes.ts";
import { simulatedNationalIdentityAdapter } from "../../../data/externalIdentity.ts";
import { renderApp } from "../../../test/render-app.tsx";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const PATIENT = SEED_ANCHORS.WF01_FLAGGED_REVIEW.patientId;
const MESSAGE =
  "National identity service is not connected in this demo. No identity was fetched or created.";

describe("ExternalIdentityStub", () => {
  it("the simulated adapter always rejects with DEPENDENCY_UNAVAILABLE", async () => {
    const error: unknown = await simulatedNationalIdentityAdapter
      .lookup({ syntheticIdentifier: "DEMO-P-0001" })
      .catch((e: unknown) => e);
    expect(isRepositoryError(error)).toBe(true);
    expect(isRepositoryError(error) ? error.code : null).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("shows the not-connected message and creates no data", async () => {
    const user = userEvent.setup();
    const { store } = await renderApp({ path: routes.patient(PATIENT), signIn: CLINICIAN });
    const button = await screen.findByRole("button", {
      name: "Check national ID (not connected in demo)",
    });
    await screen.findByTestId("patient-kpis");
    const counts = async () => ({
      patients: (await store.getAll("patients")).length,
      audit: (await store.getAll("auditEvents")).length,
    });
    const before = await counts();
    await user.click(button);
    const result = await screen.findByTestId("external-identity-result");
    expect(result.textContent).toContain(MESSAGE);
    expect(result.getAttribute("data-error-code")).toBe("DEPENDENCY_UNAVAILABLE");
    expect(await counts()).toEqual(before);
  });
});
