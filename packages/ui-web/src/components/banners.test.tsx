import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { InfoCallout } from "./InfoCallout.tsx";
import { OfflineBanner } from "./OfflineBanner.tsx";
import { PrivacyNotice } from "./PrivacyNotice.tsx";
import { RoleBanner } from "./RoleBanner.tsx";
import { RuleDisclaimer } from "./RuleDisclaimer.tsx";

describe("RoleBanner", () => {
  it("shows persona, role, scope and the not-authentication disclaimer", async () => {
    const { container } = renderUi(
      <RoleBanner personaName="Demo Clinician A" roleLabel="Clinician" scopeLabel="Alpha-1" />,
    );
    expect(screen.getByText("Demo Clinician A")).toBeTruthy();
    expect(screen.getByText("Scope: Alpha-1")).toBeTruthy();
    expect(screen.getByText("Demo role switch — not authentication")).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});

describe("OfflineBanner", () => {
  it("is a status with the offline message and last sync time", async () => {
    const { container } = renderUi(<OfflineBanner lastSyncedLabel="08:00" />);
    expect(screen.getByRole("status").textContent).toContain(
      "You are offline. Changes are saved on this device.",
    );
    expect(screen.getByText("Last synced 08:00")).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});

describe("RuleDisclaimer", () => {
  it("shows the DEMO_RULE_NOT_CLINICALLY_VALIDATED code and a translated explanation", async () => {
    const { container } = renderUi(<RuleDisclaimer />, { language: "rw" });
    expect(screen.getByText("DEMO_RULE_NOT_CLINICALLY_VALIDATED")).toBeTruthy();
    expect(screen.getByText(/itegeko ry'igerageza/)).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});

describe("InfoCallout / PrivacyNotice", () => {
  it("renders a titled explanation card", async () => {
    const { container } = renderUi(
      <InfoCallout title="How to read this">
        Readings are compared with demo thresholds.
      </InfoCallout>,
    );
    expect(screen.getByRole("complementary")).toBeTruthy();
    expect(screen.getByText("How to read this")).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("PrivacyNotice defaults to the synthetic-data statement", () => {
    renderUi(<PrivacyNotice />);
    expect(screen.getByText("Privacy")).toBeTruthy();
    expect(screen.getByText(/synthetic data only/)).toBeTruthy();
  });
});
