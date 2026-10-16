/**
 * FND-10 AC 2 + 6: every pressable in the kit has an accessibilityRole, an accessible label
 * and a computed hit area ≥ 44 × 44; no component disables font scaling.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { renderNative } from "@laif/test-utils/native";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  AppHeader,
  Button,
  CheckboxField,
  ConfirmSheet,
  ConflictCard,
  DemoToolsSheet,
  EmptyState,
  ErrorState,
  IconButton,
  LanguageSwitcher,
  ListRow,
  PersonaSwitcher,
  RadioCardGroup,
  SegmentedControl,
  SelectSheet,
  TabbedFilter,
  Toggle,
} from "./index.ts";
import { expectAccessiblePressable, PRESSABLE_ROLES } from "./test/helpers.ts";

const noop = () => undefined;

function pressables(): HTMLElement[] {
  return PRESSABLE_ROLES.flatMap((role) => screen.queryAllByRole(role, { hidden: true }));
}

describe("touch targets (AC 2)", () => {
  it("every pressable on a composed screen has role, label and ≥ 44 × 44", () => {
    renderNative(
      <>
        <AppHeader
          title="Today"
          onBack={noop}
          right={<IconButton icon="bell" labelKey="shell:notifications.label" badge />}
        />
        <PersonaSwitcher
          value="p1"
          onChange={noop}
          personas={[{ id: "p1", name: "Aline Uwase", roleLabel: "CHW" }]}
        />
        <LanguageSwitcher />
        <Button size="sm" onPress={noop}>
          Small
        </Button>
        <Button variant="ghost" onPress={noop}>
          Ghost
        </Button>
        <Button variant="secondary" icon="plus" onPress={noop}>
          Add
        </Button>
        <ListRow title="Marie U." onPress={noop} />
        <CheckboxField label="Consent" checked={false} onChange={noop} />
        <Toggle label="Reminders" value={false} onValueChange={noop} />
        <RadioCardGroup
          legend="Outcome"
          value={null}
          onChange={noop}
          options={[{ value: "a", label: "Reached" }]}
        />
        <SegmentedControl
          label="Unit"
          value="a"
          onChange={noop}
          options={[
            { value: "a", label: "mg" },
            { value: "b", label: "mmol" },
          ]}
        />
        <SelectSheet
          label="Facility"
          value={null}
          onChange={noop}
          options={[{ value: "a", label: "A" }]}
        />
        <TabbedFilter
          label="Tasks"
          value="t"
          onChange={noop}
          tabs={[
            { value: "t", label: "Today", count: 2 },
            { value: "d", label: "Done" },
          ]}
        />
        <EmptyState onClearFilters={noop} />
        <ErrorState code="TIMEOUT" onRetry={noop} />
        <ConflictCard
          rows={[{ id: "x", label: "Outcome", yours: "A", latest: "B" }]}
          onResolve={noop}
        />
      </>,
    );
    const found = pressables();
    expect(found.length).toBeGreaterThanOrEqual(20);
    for (const element of found) {
      const role = element.getAttribute("role") ?? "";
      expectAccessiblePressable(element, role);
    }
  });

  it.each([
    [
      "ConfirmSheet",
      <ConfirmSheet key="c" visible title="Confirm?" onClose={noop} onConfirm={noop} />,
    ],
    [
      "DemoToolsSheet",
      <DemoToolsSheet
        key="d"
        visible
        onClose={noop}
        onReset={noop}
        faults={{ offline: false, slow: false, errors: false }}
        onFaultChange={noop}
        scenarios={[{ id: "SCN-01", title: "Normal screening" }]}
        onLoadScenario={noop}
      />,
    ],
  ])("pressables inside %s meet the same bar", (_name, ui) => {
    renderNative(ui);
    const found = pressables();
    expect(found.length).toBeGreaterThanOrEqual(3);
    for (const element of found)
      expectAccessiblePressable(element, element.getAttribute("role") ?? "");
  });

  it("a select sheet's options meet the bar once opened", () => {
    renderNative(
      <SelectSheet
        label="Facility"
        value="a"
        onChange={noop}
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
        testID="sel"
      />,
    );
    fireEvent.click(screen.getByTestId("sel"));
    for (const element of screen.getAllByRole("radio")) expectAccessiblePressable(element, "radio");
  });
});

describe("dynamic type (AC 6)", () => {
  const root = join(import.meta.dirname, "components");
  const files = readdirSync(root).filter(
    (name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"),
  );

  it.each(files)("%s never sets allowFontScaling={false}", (file) => {
    const source = readFileSync(join(root, file), "utf8");
    expect(source).not.toMatch(/allowFontScaling\s*(=\s*\{\s*false\s*\}|:\s*false)/);
  });
});
