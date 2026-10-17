/**
 * CLN-05 queue row: expand / collapse (mouse + Enter / Space) with `aria-expanded`, → opens the
 * review, accordion (one open at a time), expanded detail (triggering readings, reasons, ruleset,
 * source, demo disclaimer, actions), and the pill priority
 * OVERDUE > URGENT · DEMO > IN REVIEW (by X) > NEEDS REVIEW (derived from the demo clock).
 */
import type { PersonaId, Review } from "@laif/domain";
import { PERSONA_IDS } from "@laif/mock-data";
import { buildReview } from "@laif/test-utils";
import { renderWithProviders } from "@laif/test-utils/web";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { queuePill } from "../model.ts";
import { QueueList } from "../QueueList.tsx";
import { QueueRow } from "../QueueRow.tsx";
import type { QueueItem, QueuePage } from "../useReviewQueue.ts";

const NOW = "2026-10-14T06:00:00.000Z";
const ME: PersonaId = PERSONA_IDS.clinAlpha1;
const NURSE: PersonaId = PERSONA_IDS.nurseAlpha2;
const PAST = "2026-10-13T10:52:00.000Z";
const FUTURE = "2026-10-15T08:28:00.000Z";

const item = (over: Partial<Review> = {}, name = "Quavox Zelqoxe"): QueueItem => {
  const review = buildReview(over);
  return {
    review,
    patient: { id: review.patientId, displayName: name, syntheticIdentifier: "DEMO-P-0007" },
    screening: {
      id: review.screeningId,
      source: "worker_mobile",
      rulesetVersion: "demo-ruleset-2026.10-v1",
      measuredAt: "2026-10-13T08:00:00.000Z",
      glucoseUnit: null,
      glucoseContext: null,
    },
  };
};

function Harness({ items }: { items: QueueItem[] }) {
  const data: QueuePage = { items, total: items.length, page: 1, pageSize: 25, nowIso: NOW };
  return (
    <Routes>
      <Route
        path="/"
        element={<QueueList data={data} page={1} personaId={ME} onPageChange={() => undefined} />}
      />
      <Route path="/clinical/reviews/:id" element={<p>Review page</p>} />
      <Route path="/clinical/patients/:id" element={<p>Patient page</p>} />
    </Routes>
  );
}

function SingleRow({ entry }: { entry: QueueItem }) {
  const [open, setOpen] = useState(false);
  return (
    <ul>
      <QueueRow
        item={entry}
        nowIso={NOW}
        personaId={ME}
        expanded={open}
        onExpandedChange={setOpen}
      />
    </ul>
  );
}

const disclosure = (name: RegExp) => screen.getByRole("button", { name });

describe("QueueRow", () => {
  it("collapsed row: initials, patient + synthetic ID, one-line reason, pill, relative time", () => {
    renderWithProviders(<SingleRow entry={item({ createdAt: "2026-10-13T06:00:00.000Z" })} />);
    const button = disclosure(/Quavox Zelqoxe/);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.textContent).toContain("QZ");
    expect(button.textContent).toContain("DEMO-P-0007");
    expect(button.textContent).toContain("Systolic blood pressure at or above the demo threshold");
    expect(button.textContent).toContain("Needs review");
    expect(button.textContent).toContain("Flagged 1 day ago");
    expect(screen.queryByTestId("queue-row-detail")).toBeNull();
  });

  it("Enter / Space toggle the row and aria-expanded follows; the detail shows the evidence", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SingleRow
        entry={item({
          flagReasons: ["DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD", "GLUCOSE_UNIT_MISSING"],
        })}
      />,
    );
    const button = disclosure(/Quavox Zelqoxe/);
    expect(button.textContent).toContain("+1 more reason");
    button.focus();
    await user.keyboard("{Enter}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const detail = screen.getByTestId("queue-row-detail");
    expect(detail.textContent).toContain("Triggering readings");
    expect(within(screen.getByTestId("triggering-readings")).getByText("150 mmHg")).toBeTruthy();
    expect(detail.textContent).toContain("demo threshold 145 mmHg");
    expect(detail.textContent).toContain("Why this needs review");
    expect(within(screen.getByTestId("flag-reasons")).getAllByRole("listitem")).toHaveLength(2);
    expect(detail.textContent).toContain("demo-ruleset-2026.10-v1");
    expect(detail.textContent).toContain("Health worker app");
    expect(detail.textContent).toContain("DEMO_RULE_NOT_CLINICALLY_VALIDATED");
    expect(screen.getByRole("button", { name: "Open review" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open patient" })).toBeTruthy();
    await user.keyboard(" ");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("queue-row-detail")).toBeNull();
  });

  it("→ on the row opens the review; Open review / Open patient navigate", async () => {
    const user = userEvent.setup();
    const entry = item();
    const first = renderWithProviders(<Harness items={[entry]} />);
    disclosure(/Quavox Zelqoxe/).focus();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByText("Review page")).toBeTruthy();
    first.unmount();

    renderWithProviders(<Harness items={[entry]} />);
    await user.click(disclosure(/Quavox Zelqoxe/));
    await user.click(screen.getByRole("button", { name: "Open patient" }));
    expect(await screen.findByText("Patient page")).toBeTruthy();
  });

  it("accordion: opening a row closes the other; nothing is open initially", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness items={[item({}, "Quavox Zelqoxe"), item({}, "Tezrix Oxaandi")]} />,
    );
    const a = disclosure(/Quavox Zelqoxe/);
    const b = disclosure(/Tezrix Oxaandi/);
    expect(a.getAttribute("aria-expanded")).toBe("false");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    await user.click(a);
    expect(a.getAttribute("aria-expanded")).toBe("true");
    await user.click(b);
    await waitFor(() => expect(a.getAttribute("aria-expanded")).toBe("false"));
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByTestId("queue-row-detail")).toHaveLength(1);
  });
});

describe("queue pill priority", () => {
  const ctx = { now: new Date(NOW), personaId: ME };
  const pill = (over: Partial<Review>) => queuePill(buildReview(over), ctx).kind;

  it("OVERDUE > URGENT · DEMO > IN REVIEW > NEEDS REVIEW", () => {
    expect(pill({ status: "in_review", priority: "urgent_demo", reviewDueAt: PAST })).toBe(
      "overdue",
    );
    expect(pill({ status: "in_review", priority: "urgent_demo", reviewDueAt: FUTURE })).toBe(
      "urgentDemo",
    );
    expect(pill({ status: "in_review", startedBy: NURSE })).toBe("inReview");
    expect(pill({ status: "pending", reviewDueAt: FUTURE })).toBe("needsReview");
    // No due date → never overdue (no invented timing).
    expect(pill({ status: "pending", reviewDueAt: null })).toBe("needsReview");
    expect(pill({ status: "action_recorded", reviewDueAt: PAST })).toBe("decided");
  });

  it("renders the labels; IN REVIEW by another clinician shows their name", () => {
    renderWithProviders(
      <ul>
        {[
          item({ reviewDueAt: PAST }, "Overdue Person"),
          item({ priority: "urgent_demo" }, "Urgent Person"),
          item({ status: "in_review", startedBy: NURSE }, "Nurse Person"),
          item({ status: "in_review", startedBy: ME }, "Mine Person"),
        ].map((entry) => (
          <QueueRow
            key={entry.review.id}
            item={entry}
            nowIso={NOW}
            personaId={ME}
            expanded={false}
            onExpandedChange={() => undefined}
          />
        ))}
      </ul>,
    );
    const pills = screen.getAllByTestId("queue-pill").map((p) => p.textContent);
    expect(pills).toEqual([
      "Overdue",
      "Urgent · demo",
      "In review · Quilra Xabezo",
      "In review · you",
    ]);
    expect(screen.queryAllByTestId("queue-pill-in-review")).toHaveLength(0);
  });

  it("an urgent review already in review also shows who is reviewing it (CLN-06)", () => {
    renderWithProviders(
      <ul>
        <QueueRow
          item={item({ priority: "urgent_demo", status: "in_review", startedBy: ME })}
          nowIso={NOW}
          personaId={ME}
          expanded={false}
          onExpandedChange={() => undefined}
        />
      </ul>,
    );
    expect(screen.getByTestId("queue-pill").textContent).toBe("Urgent · demo");
    expect(screen.getByTestId("queue-pill-in-review").textContent).toBe("In review · you");
  });
});
