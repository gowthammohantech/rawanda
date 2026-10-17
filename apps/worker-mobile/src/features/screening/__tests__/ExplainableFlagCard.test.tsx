/**
 * HWM-06 flag card: translated reason codes, inputs, ruleset version, the disclaimer ALWAYS
 * shown, the neutral card (incl. an informational `GLUCOSE_CONTEXT_NOT_RECORDED`), the generic
 * "needs a person" explanation when required inputs are missing (empty reason codes), EN / RW,
 * and a deny-list scan of every EN / RW flag string for diagnostic / treatment wording.
 */
import { evaluateScreening, type ScreeningEvaluationInput } from "@laif/domain";
import { resources } from "@laif/i18n";
import { DEMO_RULESET_V1 } from "@laif/mock-data";
import { renderNative } from "@laif/test-utils/native";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExplainableFlagCard } from "../ExplainableFlagCard.tsx";

const input = (patch: Partial<ScreeningEvaluationInput>): ScreeningEvaluationInput => ({
  systolic: 120,
  diastolic: 78,
  glucoseValue: null,
  glucoseUnit: null,
  glucoseContext: null,
  ...patch,
});

function renderFlag(
  inputs: ScreeningEvaluationInput,
  options: { language?: "en" | "rw"; preview?: boolean } = {},
) {
  const flag = evaluateScreening(inputs, DEMO_RULESET_V1);
  renderNative(
    <ExplainableFlagCard
      flag={flag}
      inputs={inputs}
      {...(options.preview === undefined ? {} : { preview: options.preview })}
    />,
    { language: options.language ?? "en" },
  );
  return flag;
}

const text = () => screen.getByTestId("flag-card").textContent ?? "";

describe("ExplainableFlagCard (HWM-06)", () => {
  it("flagged: may need clinician review, translated reasons, compared readings, inputs, version, disclaimer", () => {
    const flag = renderFlag(
      input({
        systolic: 162,
        diastolic: 99,
        glucoseValue: 8.1,
        glucoseUnit: "mmol/L",
        glucoseContext: "fasting",
      }),
    );
    expect(flag.reasonCodes).toEqual([
      "DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD",
      "DEMO_BP_DIASTOLIC_AT_OR_ABOVE_THRESHOLD",
      "DEMO_GLUCOSE_AT_OR_ABOVE_THRESHOLD",
    ]);
    expect(screen.getByTestId("flag-may-need-review").textContent).toBe(
      "May need clinician review (demo rule)",
    );
    expect(
      screen.getByTestId("flag-reason-DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD").textContent,
    ).toContain("Systolic blood pressure at or above the demo threshold");
    expect(screen.getByTestId("flag-reason-DEMO_GLUCOSE_AT_OR_ABOVE_THRESHOLD")).toBeTruthy();
    expect(screen.getByTestId("flag-observations").textContent).toContain("demo threshold");
    expect(screen.getByTestId("flag-inputs").textContent).toContain("162/99 mmHg");
    expect(screen.getByTestId("flag-inputs").textContent).toContain("8.1 mmol/L");
    expect(screen.getByTestId("flag-ruleset").textContent).toBe(
      `Ruleset ${DEMO_RULESET_V1.version}`,
    );
    expect(screen.getByTestId("flag-disclaimer").textContent).toBe(
      "Illustrative demo rule — not clinically validated. A clinician decides.",
    );
    expect(text()).toContain("DEMO_RULE_NOT_CLINICALLY_VALIDATED");
    expect(screen.getByTestId("flag-preview")).toBeTruthy();
  });

  it("not triggered: neutral card; an explicit not_recorded context is an information item", () => {
    const flag = renderFlag(
      input({ glucoseValue: 6.2, glucoseUnit: "mmol/L", glucoseContext: "not_recorded" }),
      { preview: false },
    );
    expect(flag).toMatchObject({
      requiresReview: false,
      reasonCodes: ["GLUCOSE_CONTEXT_NOT_RECORDED"],
    });
    expect(screen.getByTestId("flag-not-triggered").textContent).toBe(
      "No demo rule triggered. A clinician may still review.",
    );
    expect(screen.queryByTestId("flag-may-need-review")).toBeNull();
    expect(screen.getByTestId("flag-info-GLUCOSE_CONTEXT_NOT_RECORDED").textContent).toContain(
      "Fasting status not recorded",
    );
    expect(screen.queryByTestId("flag-reason-GLUCOSE_CONTEXT_NOT_RECORDED")).toBeNull();
    expect(screen.getByTestId("flag-confirmed")).toBeTruthy();
    expect(screen.getByTestId("flag-disclaimer")).toBeTruthy();
  });

  it("missing required inputs → needs review with no reason codes: generic explanation", () => {
    const flag = renderFlag(
      input({
        systolic: null,
        diastolic: null,
        glucoseValue: 6,
        glucoseUnit: "mmol/L",
        glucoseContext: "fasting",
      }),
    );
    expect(flag).toMatchObject({ requiresReview: true, evaluable: false, reasonCodes: [] });
    expect(screen.getByTestId("flag-may-need-review")).toBeTruthy();
    expect(screen.getByTestId("flag-needs-person").textContent).toContain(
      "the demo rule could not check these readings",
    );
    expect(screen.getByTestId("flag-disclaimer")).toBeTruthy();
  });

  it("not evaluable (unit missing) lists the reason as the why", () => {
    const flag = renderFlag(
      input({ glucoseValue: 7, glucoseUnit: null, glucoseContext: "fasting" }),
    );
    expect(flag.reasonCodes).toEqual(["GLUCOSE_UNIT_MISSING"]);
    expect(screen.getByTestId("flag-reason-GLUCOSE_UNIT_MISSING")).toBeTruthy();
  });

  it("renders in Kinyarwanda with the RW disclaimer", () => {
    renderFlag(input({ systolic: 150, diastolic: 80 }), { language: "rw" });
    expect(screen.getByTestId("flag-may-need-review").textContent).toBe(
      "Bishobora gusuzumwa na muganga (itegeko ry'igerageza)",
    );
    expect(screen.getByTestId("flag-disclaimer").textContent).toBe(
      "Itegeko ry'urugero gusa — ntiryemejwe n'abaganga. Muganga ni we ufata icyemezo.",
    );
  });

  it("deny-list: no diagnostic or treatment words in any EN / RW flag string", () => {
    const DENY = [
      // EN
      "diagnos",
      "hypertens",
      "diabet",
      "disease",
      "treat",
      "medicat",
      "prescri",
      "abnormal",
      "dangerous",
      "high blood pressure",
      "you have",
      // RW (disease, hypertension, medicine, to treat, diagnosis)
      "indwara",
      "umuvuduko ukabije",
      "diyabete",
      "imiti",
      "kuvura",
      "isuzumabumenyi",
    ];
    const strings: string[] = [];
    const collect = (value: unknown) => {
      if (typeof value === "string") strings.push(value);
      else if (value !== null && typeof value === "object") Object.values(value).forEach(collect);
    };
    for (const lng of ["en", "rw"] as const) {
      const worker = resources[lng].worker as unknown as {
        review: Record<string, unknown> & { flag: unknown };
      };
      collect(worker.review.flag);
      collect(worker.review["mayNeedReview"]);
      collect(worker.review["disclaimer"]);
      collect((resources[lng].domain as unknown as { reason: unknown }).reason);
      collect((resources[lng].common as unknown as { flag: unknown }).flag);
    }
    expect(strings.length).toBeGreaterThan(30);
    const hits = strings.filter((s) => DENY.some((word) => s.toLowerCase().includes(word)));
    expect(hits).toEqual([]);
  });
});
