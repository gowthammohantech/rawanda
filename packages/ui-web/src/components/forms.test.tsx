import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { Checkbox } from "./Checkbox.tsx";
import { DateTimeInput, kigaliWallTimeToUtcIso, utcIsoToKigaliWallTime } from "./DateTimeInput.tsx";
import { Field } from "./Field.tsx";
import { NumberInput, parseDecimal } from "./NumberInput.tsx";
import { RadioCardGroup } from "./RadioCardGroup.tsx";
import { Select } from "./Select.tsx";
import { Textarea } from "./Textarea.tsx";
import { TextInput } from "./TextInput.tsx";

describe("Field / TextInput", () => {
  it("wires label, hint and a translated validation error", async () => {
    const { container } = renderUi(
      <TextInput
        label="Reason"
        hint="Shown in the audit log"
        error={'validation:reasonTooShort|{"min":10}'}
        required
      />,
    );
    const input = screen.getByRole("textbox", { name: /Reason/ });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(describedBy).toHaveLength(2);
    const errorText = document.getElementById(describedBy[1] ?? "")?.textContent ?? "";
    expect(errorText).toMatch(/10/);
    expect(errorText).not.toContain("validation:");
    await expectNoAxeViolations(container);
  });

  it("renders validation errors in RW", () => {
    renderUi(
      <Field label="Igipimo" error={{ message: "validation:required" }}>
        {(control) => <input {...control} />}
      </Field>,
      { language: "rw" },
    );
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("NumberInput", () => {
  it("shows the unit suffix and parses decimals with , or .", async () => {
    const { container } = renderUi(<NumberInput label="Systolic" unit="mmHg" defaultValue="152" />);
    expect(screen.getByText("mmHg")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Systolic" }).getAttribute("inputmode")).toBe(
      "decimal",
    );
    expect(parseDecimal("7,8")).toBe(7.8);
    expect(parseDecimal("7.8")).toBe(7.8);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    await expectNoAxeViolations(container);
  });
});

describe("Select", () => {
  it("is a labelled native select with a placeholder", async () => {
    const { container } = renderUi(
      <Select
        label="Facility"
        placeholder="Choose"
        options={[{ value: "a", label: "Alpha-1" }]}
        defaultValue=""
      />,
    );
    const select = screen.getByRole("combobox", { name: "Facility" });
    expect(select.querySelectorAll("option")).toHaveLength(2);
    await expectNoAxeViolations(container);
  });
});

describe("Textarea", () => {
  it("shows a live character counter", async () => {
    function Harness() {
      const [value, setValue] = useState("");
      return (
        <Textarea
          label="Note"
          maxLength={200}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      );
    }
    const user = userEvent.setup();
    const { container } = renderUi(<Harness />);
    expect(screen.getByText("0 of 200 characters")).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "Note" }), "abc");
    expect(screen.getByText("3 of 200 characters")).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});

describe("RadioCardGroup", () => {
  it("is a fieldset of radios selectable by keyboard", async () => {
    function Harness({ onChange }: { onChange: (v: string) => void }) {
      const [value, setValue] = useState<"refer" | "dismiss" | null>(null);
      return (
        <RadioCardGroup
          legend="Decision"
          value={value}
          onChange={(v) => {
            setValue(v);
            onChange(v);
          }}
          options={[
            { value: "refer", label: "Refer", description: "Create a referral" },
            { value: "dismiss", label: "Dismiss flag" },
          ]}
        />
      );
    }
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderUi(<Harness onChange={onChange} />);
    expect(screen.getByRole("group", { name: "Decision" })).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /Refer/ }));
    expect(onChange).toHaveBeenLastCalledWith("refer");
    await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith("dismiss");
    await expectNoAxeViolations(container);
  });
});

describe("DateTimeInput", () => {
  it("converts Kigali wall time ⇄ UTC ISO", () => {
    expect(utcIsoToKigaliWallTime("2026-10-14T06:00:00.000Z")).toBe("2026-10-14T08:00");
    expect(kigaliWallTimeToUtcIso("2026-10-14T08:00")).toBe("2026-10-14T06:00:00.000Z");
    expect(kigaliWallTimeToUtcIso("2026-10-15T01:30")).toBe("2026-10-14T23:30:00.000Z");
    expect(kigaliWallTimeToUtcIso("2026-02-30T08:00")).toBeNull();
    expect(kigaliWallTimeToUtcIso("")).toBeNull();
    expect(utcIsoToKigaliWallTime(null)).toBe("");
  });

  it("shows Kigali time and emits UTC", async () => {
    const onChange = vi.fn();
    const { container } = renderUi(
      <DateTimeInput label="Due" value="2026-10-14T06:00:00.000Z" onChange={onChange} />,
    );
    const input = screen.getByLabelText<HTMLInputElement>("Due");
    expect(input.value).toBe("2026-10-14T08:00");
    expect(screen.getByText("Kigali time (UTC+2)")).toBeTruthy();
    fireEvent.change(input, { target: { value: "2026-10-20T09:15" } });
    expect(onChange).toHaveBeenCalledWith("2026-10-20T07:15:00.000Z");
    await expectNoAxeViolations(container);
  });
});

describe("Checkbox", () => {
  it("is labelled and described", async () => {
    const { container } = renderUi(<Checkbox label="Identify drop-off" description="Due Oct 12" />);
    const box = screen.getByRole("checkbox", { name: "Identify drop-off" });
    expect(box.getAttribute("aria-describedby")).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});
