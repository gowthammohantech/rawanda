/**
 * CLN-07 `ReviewDecisionPanel` in isolation (RHF + the FND-03 contract via `createDecisionFormSchema`):
 * - five outcomes (FND-02 kinds), nothing preselected, Save disabled until one is chosen;
 * - each outcome shows only its own fields; switching clears the other values;
 * - empty submit → translated field errors + focused error summary with anchor links; RW messages;
 * - dismissal rationale < 10 characters rejected; due date must be after demo now;
 * - keyboard: arrow keys move between outcomes, Ctrl/⌘ + Enter = Save;
 * - valid values → `onValid` with the contract shape (refer carries `referralReason`).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { REVIEW_DECISION_INPUT_KINDS } from "@laif/domain";
import { enResources } from "@laif/i18n";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { renderWithProviders } from "@laif/test-utils/web";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, type Resolver } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import {
  createDecisionFormSchema,
  EMPTY_DECISION_VALUES,
  type DecisionFormOutput,
  type DecisionFormValues,
} from "../form.ts";
import { ReviewDecisionPanel } from "../ReviewDecisionPanel.tsx";

const NOW = "2026-10-14T06:00:00.000Z";
const REVIEW_ID = "128f9395-8caf-55e9-9281-75958ca32593";
const KEY = "5b0c3a52-4b3e-4b8e-9b7c-1f2d3e4a5b6c";
const WORKERS = [
  { id: PERSONA_IDS.chwAlpha1A, displayName: "Oxavel Oquumbra" },
  { id: PERSONA_IDS.chwAlpha1B, displayName: "Ixozo Texaelix" },
];

function Harness({ onValid }: { onValid: (v: DecisionFormOutput) => void }) {
  const form = useForm<DecisionFormValues, unknown, DecisionFormOutput>({
    resolver: zodResolver(
      createDecisionFormSchema({
        reviewId: REVIEW_ID,
        expectedVersion: 2,
        nowIso: NOW,
        idempotencyKey: KEY,
      }),
    ) as Resolver<DecisionFormValues, unknown, DecisionFormOutput>,
    defaultValues: EMPTY_DECISION_VALUES,
    shouldFocusError: false,
  });
  return (
    <ReviewDecisionPanel
      form={form}
      nowIso={NOW}
      workers={{ workers: WORKERS, loading: false }}
      onValid={(variables) => onValid(variables)}
    />
  );
}

const radio = (name: RegExp) => screen.getByRole("radio", { name });
const save = () => screen.getByTestId("decision-save");

describe("ReviewDecisionPanel", () => {
  it("offers the five FND-02 outcomes, none preselected; Save disabled until one is chosen", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onValid={vi.fn()} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(REVIEW_DECISION_INPUT_KINDS.length);
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect((save() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("decision-fields")).toBeNull();
    await user.click(radio(/^Refer/));
    expect((save() as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows only the chosen outcome's fields and clears them when switching", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onValid={vi.fn()} />);
    await user.click(radio(/^Refer/));
    const fields = screen.getByTestId("decision-fields");
    expect(fields.getAttribute("data-kind")).toBe("refer");
    expect(within(fields).getByLabelText(/^Destination facility/)).toBeTruthy();
    expect(within(fields).getByLabelText(/^Referral reason/)).toBeTruthy();
    expect(within(fields).getByLabelText(/^Priority/)).toBeTruthy();
    expect(within(fields).getByLabelText(/^Due date and time/)).toBeTruthy();
    // Focus moved to the first field of the chosen outcome.
    await waitFor(() =>
      expect(document.activeElement).toBe(within(fields).getByLabelText(/^Destination facility/)),
    );
    // Destinations are the seed facilities, labelled (demo).
    const destination = within(fields).getByLabelText(/^Destination facility/);
    expect(within(destination).getByRole("option", { name: /Alpha-2 \(demo\)/ })).toBeTruthy();
    await user.type(within(fields).getByLabelText(/^Referral reason/), "Readings above demo rule");

    await user.click(radio(/^Dismiss flag with reason/));
    const dismiss = screen.getByTestId("decision-fields");
    expect(dismiss.getAttribute("data-kind")).toBe("dismiss");
    expect(within(dismiss).queryByLabelText(/^Referral reason/)).toBeNull();
    expect(within(dismiss).getByLabelText(/^Dismiss reason/)).toBeTruthy();
    expect(within(dismiss).getByLabelText(/^Rationale for dismissing/)).toBeTruthy();

    await user.click(radio(/^Refer/));
    expect(
      within(screen.getByTestId("decision-fields")).getByLabelText<HTMLTextAreaElement>(
        /^Referral reason/,
      ).value,
    ).toBe("");

    await user.click(radio(/^Request repeat test/));
    const repeat = screen.getByTestId("decision-fields");
    const worker = within(repeat).getByLabelText(/^Community health worker/);
    expect(
      within(worker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Choose a health worker", "Oxavel Oquumbra", "Ixozo Texaelix"]);
  });

  it("empty submit → translated errors + focused error summary; RW messages after switching", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    const { i18n } = renderWithProviders(<Harness onValid={onValid} />);
    await user.click(radio(/^Dismiss flag with reason/));
    await user.click(save());
    const summary = await screen.findByTestId("decision-error-summary");
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(
      within(summary)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["Dismiss reason", "Rationale for dismissing"]);
    expect(screen.getAllByText("This field is required.")).toHaveLength(2);
    expect(onValid).not.toHaveBeenCalled();

    // Anchor link focuses the field.
    await user.click(within(summary).getByRole("link", { name: "Rationale for dismissing" }));
    expect(document.activeElement).toBe(screen.getByLabelText(/^Rationale for dismissing/));

    await act(async () => {
      await i18n.setLanguage("rw");
    });
    const rwRequired = i18n.t("validation:required");
    expect(rwRequired).not.toBe("This field is required.");
    expect(screen.getAllByText(rwRequired)).toHaveLength(2);
    await act(async () => {
      await i18n.setLanguage("en");
    });
  });

  it("rejects a dismissal rationale under 10 characters and a past due date", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onValid={vi.fn()} />);
    await user.click(radio(/^Dismiss flag with reason/));
    await user.selectOptions(screen.getByLabelText(/^Dismiss reason/), "duplicate_flag");
    await user.type(screen.getByLabelText(/^Rationale for dismissing/), "too short");
    await user.click(save());
    expect(await screen.findByText("Give a reason of at least 10 characters.")).toBeTruthy();

    await user.click(radio(/^Plan follow-up review/));
    fireEvent.change(screen.getByLabelText(/^Due date and time/), {
      target: { value: "2026-10-13T09:00" },
    });
    await user.type(screen.getByLabelText(/^Clinical note/), "Review the readings next week");
    await user.click(save());
    expect(await screen.findByText("The date must be later than the current time.")).toBeTruthy();
  });

  it("arrow keys move between outcomes; Ctrl+Enter saves; valid refer → contract shape", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    renderWithProviders(<Harness onValid={onValid} />);
    const first = radio(/^Record assessment/);
    first.focus();
    await user.keyboard("{ArrowDown}");
    expect((radio(/^Refer/) as HTMLInputElement).checked).toBe(true);
    // Arrow-key browsing keeps focus on the radios.
    expect(document.activeElement).toBe(radio(/^Refer/));

    await user.selectOptions(screen.getByLabelText(/^Destination facility/), FACILITY_IDS.alpha2);
    await user.type(screen.getByLabelText(/^Referral reason/), "Readings above the demo rule");
    await user.selectOptions(screen.getByLabelText(/^Priority/), "routine");
    fireEvent.change(screen.getByLabelText(/^Due date and time/), {
      target: { value: "2026-10-21T09:30" },
    });
    await user.click(screen.getByLabelText(/^Referral reason/));
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1));
    expect(onValid.mock.calls[0]?.[0]).toEqual({
      kind: "refer",
      reviewId: REVIEW_ID,
      expectedVersion: 2,
      destinationFacilityId: FACILITY_IDS.alpha2,
      referralReason: "Readings above the demo rule",
      priority: "routine",
      dueAt: "2026-10-21T07:30:00.000Z",
    });
  });
});

describe("clinical:decision copy safety", () => {
  const strings = (value: unknown): string[] =>
    typeof value === "string"
      ? [value]
      : value !== null && typeof value === "object"
        ? Object.values(value).flatMap(strings)
        : [];
  const copy = strings((enResources.clinical as { decision: unknown }).decision);
  const BANNED = [
    "diagnos",
    "recommend",
    "suggest",
    "treatment",
    "medication",
    "prescri",
    "hypertens",
    "diabet",
    " ai ",
  ];

  it("has EN copy for every outcome", () => {
    const outcomes = (enResources.clinical as { decision: { outcomes: Record<string, unknown> } })
      .decision.outcomes;
    expect(Object.keys(outcomes).sort()).toEqual([...REVIEW_DECISION_INPUT_KINDS].sort());
  });

  it.each(BANNED)("never uses %s (no AI recommendation, no treatment wording)", (word) => {
    for (const text of copy) expect(` ${text.toLowerCase()} `, text).not.toContain(word);
  });
});
