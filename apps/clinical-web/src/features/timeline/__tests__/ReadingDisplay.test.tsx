/**
 * CLN-04 `ReadingDisplay`: every reading shows a unit or an explicit UNIT MISSING warning; the
 * measurement context is always shown; a value without unit is never converted.
 */
import { renderWithProviders } from "@laif/test-utils/web";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReadingDisplay } from "../ReadingDisplay.tsx";

describe("ReadingDisplay (timeline)", () => {
  it("blood pressure carries mmHg", () => {
    renderWithProviders(<ReadingDisplay kind="bloodPressure" systolic={152} diastolic={96} />);
    expect(screen.getByText("152/96 mmHg")).toBeTruthy();
  });

  it("glucose carries its unit and context", () => {
    renderWithProviders(
      <ReadingDisplay kind="glucose" value={7.8} unit="mmol/L" context="non_fasting" />,
    );
    expect(screen.getByText("7.8 mmol/L")).toBeTruthy();
    expect(screen.getByText("· Non-fasting")).toBeTruthy();
    expect(screen.queryByTestId("reading-unit-missing")).toBeNull();
  });

  it("mg/dL is shown as recorded (no conversion)", () => {
    renderWithProviders(
      <ReadingDisplay kind="glucose" value={140} unit="mg/dL" context="fasting" />,
    );
    expect(screen.getByText("140 mg/dL")).toBeTruthy();
    expect(screen.getByText("· Fasting")).toBeTruthy();
  });

  it("a missing unit shows the raw value, the UNIT MISSING pill and the explanation", () => {
    renderWithProviders(
      <ReadingDisplay kind="glucose" value={9.2} unit={null} context="non_fasting" />,
    );
    const reading = screen.getByTestId("reading-unit-missing");
    expect(reading.textContent).toContain("9.2");
    expect(reading.textContent).not.toMatch(/mmol|mg\/dL/);
    expect(screen.getByText("Unit missing")).toBeTruthy();
    expect(
      screen.getByText("Value recorded without unit — not evaluated by demo rules"),
    ).toBeTruthy();
  });

  it("a missing context reads 'Not recorded'", () => {
    renderWithProviders(<ReadingDisplay kind="glucose" value={5.1} unit="mmol/L" context={null} />);
    expect(screen.getByText("· Not recorded")).toBeTruthy();
  });

  it("missing values read 'Not measured' (never a bare number)", () => {
    renderWithProviders(
      <>
        <ReadingDisplay kind="bloodPressure" systolic={null} diastolic={null} />
        <ReadingDisplay kind="glucose" value={null} unit={null} context={null} />
      </>,
    );
    expect(screen.getAllByText("Not measured")).toHaveLength(2);
  });

  it("translates the warning to Kinyarwanda", () => {
    renderWithProviders(
      <ReadingDisplay kind="glucose" value={9.2} unit={null} context="fasting" />,
      {
        language: "rw",
      },
    );
    expect(screen.getByText("Igipimo kibura")).toBeTruthy();
    expect(screen.getByText("· Atariye")).toBeTruthy();
  });
});
