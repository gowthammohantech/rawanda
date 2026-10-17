import type { FlagResult } from "@laif/domain";
import { renderNative } from "@laif/test-utils/native";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConflictCard } from "./ConflictCard.tsx";
import { ExplainableFlag } from "./ExplainableFlag.tsx";
import { ListRow } from "./ListRow.tsx";
import { MetricTile } from "./MetricTile.tsx";
import { ReadingDisplay } from "./ReadingDisplay.tsx";
import { StatusChip } from "./StatusChip.tsx";
import { SummaryStrip } from "./SummaryStrip.tsx";
import { TabbedFilter } from "./TabbedFilter.tsx";
import { Timeline } from "./Timeline.tsx";

describe("StatusChip", () => {
  it("renders icon + text and reads as 'Status: …'", () => {
    renderNative(<StatusChip tone="warning">Needs review</StatusChip>);
    const chip = screen.getByLabelText("Status: Needs review");
    expect(chip.textContent).toBe("Needs review");
    expect(screen.getByTestId("icon-alert")).toBeTruthy();
  });

  it("refuses colour-only status", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderNative(<StatusChip tone="danger">{"  "}</StatusChip>)).toThrow(
      /never conveyed by colour/,
    );
    vi.restoreAllMocks();
  });
});

describe("ReadingDisplay (AC 4)", () => {
  it("shows value + unit for blood pressure and glucose", () => {
    renderNative(
      <>
        <ReadingDisplay kind="bloodPressure" systolic={148} diastolic={92} />
        <ReadingDisplay kind="glucose" value={7.8} unit="mmol/L" context="non_fasting" />
      </>,
    );
    expect(screen.getByText("148/92 mmHg")).toBeTruthy();
    expect(screen.getByText("7.8 mmol/L")).toBeTruthy();
    expect(screen.getByText(/· /)).toBeTruthy();
  });

  it("never renders a bare value: missing unit shows the Unit missing chip", () => {
    renderNative(
      <>
        <ReadingDisplay kind="glucose" value={9.1} unit={null} />
        <ReadingDisplay kind="measurement" value={70} unit=" " />
      </>,
    );
    expect(screen.getAllByText("Unit missing")).toHaveLength(2);
  });

  it("uses the RW decimal format and chip text", () => {
    renderNative(<ReadingDisplay kind="glucose" value={7.8} unit={null} />, { language: "rw" });
    expect(screen.getByText("Igipimo kibura")).toBeTruthy();
  });
});

describe("MetricTile / SummaryStrip", () => {
  it("formats numbers and suppressed counts", () => {
    renderNative(
      <SummaryStrip
        label="Today"
        items={[
          { id: "a", label: "Due today", value: 12, tone: "info" },
          { id: "b", label: "Overdue", value: { value: 3, suppressed: true }, hint: "district" },
          { id: "c", label: "Synced", value: "—" },
        ]}
      />,
    );
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Suppressed (<5)")).toBeTruthy();
    expect(screen.getByLabelText(/Overdue, Fewer than 5/)).toBeTruthy();
  });

  it("standalone tile", () => {
    renderNative(<MetricTile label="Screenings" value={1234} hint="this week" />);
    expect(screen.getByLabelText("Screenings, 1,234, this week")).toBeTruthy();
  });
});

describe("Timeline and ListRow", () => {
  it("renders items with date rail and chips", () => {
    renderNative(
      <Timeline
        label="History"
        items={[
          {
            id: "1",
            dateLabel: "14 OCT",
            title: "Screening recorded",
            description: "By Aline",
            chip: <StatusChip>Done</StatusChip>,
          },
          { id: "2", dateLabel: "15 OCT", title: "Follow-up", meta: "08:00" },
        ]}
      />,
    );
    expect(screen.getByRole("list", { name: "History" })).toBeTruthy();
    expect(screen.getByText("14 OCT")).toBeTruthy();
    expect(screen.getByText("08:00")).toBeTruthy();
  });

  it("pressable ListRow exposes a combined label", () => {
    const onPress = vi.fn();
    renderNative(
      <ListRow title="Marie U." subtitle="Follow-up due" meta="DUE 14 OCT" onPress={onPress} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Marie U., Follow-up due, DUE 14 OCT" }));
    expect(onPress).toHaveBeenCalledOnce();
  });
});

describe("TabbedFilter", () => {
  it("marks the selected tab and announces counts", () => {
    const onChange = vi.fn();
    renderNative(
      <TabbedFilter
        label="Task filter"
        value="today"
        onChange={onChange}
        tabs={[
          { value: "today", label: "Today", count: 4 },
          { value: "overdue", label: "Overdue", count: 1 },
          { value: "done", label: "Done" },
        ]}
      />,
    );
    const today = screen.getByRole("tab", { name: "Today, 4 items" });
    expect(today.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Overdue, 1 item" }));
    expect(onChange).toHaveBeenCalledWith("overdue");
    fireEvent.click(today);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

const flag: FlagResult = {
  requiresReview: true,
  evaluable: true,
  reasonCodes: ["DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD", "GLUCOSE_CONTEXT_NOT_RECORDED"],
  triggeringObservations: [{ code: "SYSTOLIC", value: 152, unit: "mmHg", comparedTo: 145 }],
  rulesetVersion: "demo-ruleset-2026.10-v1",
  displayDisclaimer: "DEMO_RULE_NOT_CLINICALLY_VALIDATED",
};

describe("ExplainableFlag", () => {
  it("explains reasons, observations, ruleset, inputs and the disclaimer", () => {
    renderNative(
      <ExplainableFlag
        flag={flag}
        inputs={{
          systolic: 152,
          diastolic: 96,
          glucoseValue: 9.1,
          glucoseUnit: "mmol/L",
          glucoseContext: null,
        }}
      />,
    );
    expect(screen.getByText("Needs review")).toBeTruthy();
    for (const code of flag.reasonCodes) {
      expect(screen.getByTestId(`flag-reason-${code}`).textContent).not.toContain(code);
    }
    expect(screen.getByText("Ruleset demo-ruleset-2026.10-v1")).toBeTruthy();
    expect(
      screen.getByText("152 mmHg — demo threshold 145 mmHg (demo placeholder value)"),
    ).toBeTruthy();
    expect(screen.getByText("152/96 mmHg")).toBeTruthy();
    expect(screen.getByText("Not recorded")).toBeTruthy();
    expect(screen.getByText("DEMO_RULE_NOT_CLINICALLY_VALIDATED")).toBeTruthy();
  });

  it("not-evaluable flags are routed to a person (RW, compact)", () => {
    renderNative(
      <ExplainableFlag
        flag={{
          ...flag,
          evaluable: false,
          reasonCodes: ["GLUCOSE_UNIT_MISSING"],
          triggeringObservations: [],
        }}
        compact
      />,
      { language: "rw" },
    );
    expect(screen.getByText("Ntibyasuzumwa — bikeneye umuntu")).toBeTruthy();
  });
});

describe("ConflictCard", () => {
  it("compares mine vs latest, marks changed rows by icon + text and resolves", () => {
    const onResolve = vi.fn();
    renderNative(
      <ConflictCard
        changedBy="Dr. Diane N."
        changedAt="2026-10-14T06:30:00.000Z"
        rows={[
          { id: "outcome", label: "Outcome", yours: "Reached", latest: "Unable to reach" },
          { id: "note", label: "Note", yours: "Visited", latest: "Visited" },
        ]}
        onResolve={onResolve}
      />,
    );
    expect(screen.getByTestId("conflict-changed-outcome").textContent).toBe("Changed");
    expect(screen.queryByTestId("conflict-changed-note")).toBeNull();
    expect(screen.getAllByText("Your version")).toHaveLength(2);
    expect(screen.getByText(/Changed by Dr. Diane N./)).toBeTruthy();
    expect(screen.getByText(/08:30/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Re-apply my change on the latest version" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep the latest version" }));
    expect(onResolve.mock.calls).toEqual([["reapply_on_latest"], ["keep_latest"]]);
  });

  it("disables the other action while resolving", () => {
    renderNative(
      <ConflictCard
        rows={[]}
        resolving="keep_latest"
        onResolve={() => undefined}
        resolutions={["reapply_on_latest", "keep_latest"]}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Re-apply my change on the latest version" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Keep the latest version" }).getAttribute("aria-busy"),
    ).toBe("true");
  });
});
