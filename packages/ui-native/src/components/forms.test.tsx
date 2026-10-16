import { renderNative } from "@laif/test-utils/native";
import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { kigaliWallTimeToUtcIso, utcIsoToKigaliWallTime } from "../kigali-time.ts";
import { CheckboxField } from "./CheckboxField.tsx";
import { DateTimeField } from "./DateTimeField.tsx";
import { NumberField, parseDecimal, sanitiseDecimalInput } from "./NumberField.tsx";
import { RadioCardGroup } from "./RadioCardGroup.tsx";
import { ReasonField, reasonLength } from "./ReasonField.tsx";
import { SegmentedControl } from "./SegmentedControl.tsx";
import { SelectSheet } from "./SelectSheet.tsx";
import { Stepper } from "./Stepper.tsx";
import { TextField } from "./TextField.tsx";
import { Toggle } from "./Toggle.tsx";

describe("decimal helpers", () => {
  it("accepts ',' and '.'", () => {
    expect(parseDecimal("7,8")).toBe(7.8);
    expect(parseDecimal("7.8")).toBe(7.8);
    expect(parseDecimal(" 12 ")).toBe(12);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("7..8")).toBeNull();
    expect(sanitiseDecimalInput("7,8.1a")).toBe("7,81");
    expect(sanitiseDecimalInput("148.5", false)).toBe("1485");
  });
});

function NumberHarness({ onValue }: { onValue: (v: number | null) => void }) {
  const [value, setValue] = useState("");
  return (
    <NumberField
      label="Glucose"
      unit="mmol/L"
      value={value}
      onChangeText={setValue}
      onValueChange={onValue}
      testID="glucose"
    />
  );
}

describe("NumberField", () => {
  it("shows the unit and parses decimals with a comma", () => {
    const onValue = vi.fn();
    renderNative(<NumberHarness onValue={onValue} />);
    const input = screen.getByTestId<HTMLInputElement>("glucose");
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(screen.getByText("mmol/L")).toBeTruthy();
    fireEvent.change(input, { target: { value: "7,8x" } });
    expect(input.value).toBe("7,8");
    expect(onValue).toHaveBeenLastCalledWith(7.8);
  });

  it("announces label, required and translated error", () => {
    renderNative(
      <NumberField
        label="Systolic"
        integer
        required
        value=""
        onChangeText={() => undefined}
        error="validation:required"
        testID="sys"
      />,
    );
    const input = screen.getByTestId("sys");
    expect(input.getAttribute("aria-label")).toBe("Systolic, Required");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(screen.getByTestId("field-error").textContent).not.toContain("validation:");
  });
});

describe("TextField / ReasonField", () => {
  it("TextField forwards value changes", () => {
    const onChangeText = vi.fn();
    renderNative(<TextField label="Name" value="" onChangeText={onChangeText} testID="name" />);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "Aline" } });
    expect(onChangeText).toHaveBeenCalledWith("Aline");
  });

  it("ReasonField counts non-whitespace characters toward 10", () => {
    expect(reasonLength("a b c")).toBe(3);
    renderNative(<ReasonField value="Patient   moved" onChangeText={() => undefined} />);
    expect(screen.getByTestId("reason-counter").textContent).toBe("12 of at least 10 characters");
  });
});

describe("Choice controls", () => {
  it("CheckboxField toggles with checkbox semantics", () => {
    const onChange = vi.fn();
    renderNative(<CheckboxField label="Consent recorded" checked={false} onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Consent recorded" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("RadioCardGroup selects an option", () => {
    const onChange = vi.fn();
    renderNative(
      <RadioCardGroup
        legend="Outcome"
        value="reached"
        onChange={onChange}
        options={[
          { value: "reached", label: "Reached", description: "Spoke to the patient" },
          { value: "unable", label: "Unable to reach" },
          { value: "x", label: "Disabled", disabled: true },
        ]}
      />,
    );
    expect(screen.getByRole("radio", { name: "Reached" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: "Unable to reach" }));
    expect(onChange).toHaveBeenCalledWith("unable");
    expect(screen.getByRole("radio", { name: "Disabled" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("SegmentedControl supports an explicit null choice", () => {
    const onChange = vi.fn();
    renderNative(
      <SegmentedControl
        label="Glucose unit"
        value={null}
        onChange={onChange}
        options={[
          { value: "mmol/L", label: "mmol/L", accessibilityLabel: "millimoles per litre" },
          { value: "mg/dL", label: "mg/dL" },
        ]}
      />,
    );
    expect(
      screen.getAllByRole("radio").every((el) => el.getAttribute("aria-checked") === "false"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "millimoles per litre" }));
    expect(onChange).toHaveBeenCalledWith("mmol/L");
  });

  it("Toggle has switch semantics", () => {
    const onValueChange = vi.fn();
    renderNative(<Toggle label="Offline" value onValueChange={onValueChange} />);
    const sw = screen.getByRole("switch", { name: "Offline" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it("SelectSheet opens a list and picks a value", () => {
    const onChange = vi.fn();
    renderNative(
      <SelectSheet
        label="Facility"
        value={null}
        onChange={onChange}
        options={[
          { value: "a1", label: "Alpha-1" },
          { value: "a2", label: "Alpha-2" },
        ]}
        testID="facility"
      />,
    );
    const trigger = screen.getByTestId("facility");
    expect(trigger.getAttribute("aria-label")).toBe("Facility: Choose an option");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("radio", { name: "Alpha-2" }));
    expect(onChange).toHaveBeenCalledWith("a2");
  });
});

describe("DateTimeField (Kigali wall time)", () => {
  it("round-trips Kigali wall time and UTC", () => {
    expect(utcIsoToKigaliWallTime("2026-10-14T06:00:00.000Z")).toBe("2026-10-14T08:00");
    expect(kigaliWallTimeToUtcIso("2026-10-14T08:00")).toBe("2026-10-14T06:00:00.000Z");
    expect(kigaliWallTimeToUtcIso("2026-02-30T08:00")).toBeNull();
    expect(kigaliWallTimeToUtcIso("2026-10-14T25:00")).toBeNull();
  });

  it("shows Kigali time and emits UTC ISO", () => {
    const onChange = vi.fn();
    renderNative(
      <DateTimeField
        label="Visit"
        value="2026-10-14T06:00:00.000Z"
        onChange={onChange}
        testID="visit"
      />,
    );
    const date = screen.getByTestId<HTMLInputElement>("visit-date");
    const time = screen.getByTestId<HTMLInputElement>("visit-time");
    expect(date.value).toBe("2026-10-14");
    expect(time.value).toBe("08:00");
    expect(screen.getByText("Kigali time (UTC+2)")).toBeTruthy();
    fireEvent.change(time, { target: { value: "09:30" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-10-14T07:30:00.000Z");
    fireEvent.change(date, { target: { value: "2026-02-30" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("Stepper", () => {
  it("announces position and current step", () => {
    renderNative(
      <Stepper
        currentIndex={1}
        steps={[
          { id: "patient", label: "Patient" },
          { id: "readings", label: "Readings" },
          { id: "review", label: "Review" },
        ]}
      />,
    );
    expect(screen.getByLabelText("Progress steps: Step 2 of 3, Readings")).toBeTruthy();
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
  });
});
