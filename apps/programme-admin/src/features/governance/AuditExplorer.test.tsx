/**
 * AuditExplorer (ADM-08 §10): URL filters (incl. a translated validation message), scoped
 * visibility (the District Alpha analyst never sees District Beta events), the correlation-chain
 * filter, keyboard pagination, the empty state with Clear filters, `admin.audit.viewed` once per
 * session + filter key, and EN / RW labels for every admin audit action.
 */
import { enResources, rwResources } from "@laif/i18n";
import { DISTRICT_IDS, PERSONA_IDS } from "@laif/mock-data";
import { AUDIT_ACTION_NAMES } from "@laif/repositories";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ADMIN_AUDIT_ACTIONS } from "../../lib/audit.ts";
import { auditEvents, bootApp } from "../../test/app.tsx";
import { AUDIT_ACTION_FILTERS, parseAuditFilters } from "./auditFilterSchema.ts";
import { actionFilterLabelKey } from "./AuditExplorer.tsx";

const AUDIT = "/admin/governance?tab=audit";

const bodyRows = () => {
  const table = within(screen.getByTestId("audit-explorer")).getByRole("table");
  return within(table).getAllByRole("row").slice(1);
};

async function openAudit(path: string, personaId: string = PERSONA_IDS.leadProgramme) {
  const booted = await bootApp({ path, signInAs: personaId, waitFor: "audit-explorer" });
  await waitFor(
    () => expect(screen.queryByRole("table") ?? screen.queryByText(/No events/)).toBeTruthy(),
    {
      timeout: 10_000,
    },
  );
  return booted;
}

function lookup(catalogue: object, dotted: string): unknown {
  let node: unknown = catalogue;
  for (const part of dotted.split(/[.:]/)) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

describe("AuditExplorer", () => {
  it("programme lead: the seeded baseline (≥ 30) plus this session's events, 25 per page, keyboard pagination", async () => {
    const user = userEvent.setup();
    const { services, router } = await openAudit(AUDIT);
    const total = (await services.repo.listAuditEvents({ pageSize: 1 })).total;
    expect(total).toBeGreaterThanOrEqual(30);
    await waitFor(() => expect(bodyRows()).toHaveLength(25));
    // This session's sign-in is listed (newest first, on page 1).
    const actions = bodyRows().map((r) => r.textContent ?? "");
    expect(actions.some((text) => text.includes("Session started"))).toBe(true);
    const next = screen.getByRole("button", { name: "Next page" });
    next.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.search).toContain("apage=2"));
    await waitFor(() => expect(screen.getByText(/Page 2 of/)).toBeTruthy());
  });

  it("URL action filter + correlation chain; invalid params get a translated message", async () => {
    const user = userEvent.setup();
    const { router } = await openAudit(`${AUDIT}&aaction=access.denied&afrom=2026-13-01`);
    expect(screen.getByTestId("audit-filter-issues").textContent).toContain(
      "Enter a date as YYYY-MM-DD.",
    );
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0));
    for (const row of bodyRows()) expect(row.textContent).toContain("Access denied");

    const chainButton = within(bodyRows()[0]!).getByRole("button", {
      name: /Show only the events/,
    });
    await user.click(chainButton);
    await waitFor(() => expect(router.state.location.search).toContain("acorr="));
    const corr = new URLSearchParams(router.state.location.search).get("acorr")!;
    expect(screen.getByTestId("audit-chain-filter").textContent).toContain(corr);
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0));
    for (const row of bodyRows()) {
      expect(within(row).getByRole("button", { name: /Show only the events/ }).textContent).toBe(
        corr.slice(0, 8),
      );
    }
  });

  it("the District Alpha analyst never sees District Beta events (seeded Beta denial)", async () => {
    const { store } = await openAudit(`${AUDIT}&aaction=access.denied`, PERSONA_IDS.analystAlpha);
    // The seed holds the analyst's own denied District Beta access …
    const seeded = await auditEvents(store, "access.denied");
    expect(
      seeded.some(
        (e) => e.districtId === DISTRICT_IDS.beta && e.actorId === PERSONA_IDS.analystAlpha,
      ),
    ).toBe(true);
    // … which the scoped explorer does not list.
    await waitFor(() =>
      expect(screen.queryByRole("table") ?? screen.queryByText(/No events/)).toBeTruthy(),
    );
    const rows = screen.queryByRole("table") === null ? [] : bodyRows();
    for (const row of rows) expect(row.textContent).not.toContain("Demo District Beta");
  });

  it("scoped list: no Beta location and no other persona's programme-level events", async () => {
    await openAudit(`${AUDIT}&aaction=session.`, PERSONA_IDS.analystAlpha);
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0));
    for (const row of bodyRows()) {
      expect(row.textContent).not.toContain("Demo District Beta");
      // Programme-level session events are the analyst's own.
      expect(row.textContent).toContain(PERSONA_IDS.analystAlpha);
    }
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0));
    for (const row of bodyRows()) expect(row.textContent).not.toContain("Demo District Beta");
  });

  it("empty state: no match → message + Clear filters", async () => {
    const user = userEvent.setup();
    const { router } = await openAudit(`${AUDIT}&acorr=no-such-chain`);
    expect(await screen.findByText("No events match these filters")).toBeTruthy();
    const clears = screen.getAllByRole("button", { name: "Clear filters" });
    await user.click(clears[clears.length - 1]!);
    await waitFor(() => expect(router.state.location.search).not.toContain("acorr"));
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0));
  });

  it("emits admin.audit.viewed once per session + filter key", async () => {
    const user = userEvent.setup();
    const { store, router } = await bootApp({
      path: AUDIT,
      signInAs: PERSONA_IDS.auditorProgramme,
      strict: true,
      waitFor: "audit-explorer",
    });
    await waitFor(async () =>
      expect(await auditEvents(store, "admin.audit.viewed")).toHaveLength(1),
    );
    await act(() => router.navigate(`${AUDIT}&aaction=export.`));
    await waitFor(async () =>
      expect(await auditEvents(store, "admin.audit.viewed")).toHaveLength(2),
    );
    // Back to the first filter key: no new event.
    await act(() => router.navigate(AUDIT));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await auditEvents(store, "admin.audit.viewed")).toHaveLength(2);
    const [first] = await auditEvents(store, "admin.audit.viewed");
    expect(first).toMatchObject({
      actorId: PERSONA_IDS.auditorProgramme,
      actorRole: "auditor",
      entityType: "audit_event",
      category: "access",
    });
    void user;
  });

  it("RW: every admin audit action and action group has EN and RW labels; the UI switches", async () => {
    const adminActions = AUDIT_ACTION_NAMES.filter((a) => a.startsWith("admin."));
    const emitted = [...new Set([...adminActions, ...ADMIN_AUDIT_ACTIONS])];
    for (const res of [enResources, rwResources]) {
      for (const action of emitted) {
        expect(lookup(res, `domain.audit.${action}`), action).toEqual(expect.any(String));
      }
      for (const value of AUDIT_ACTION_FILTERS) {
        expect(lookup(res, actionFilterLabelKey(value)), value).toEqual(expect.any(String));
      }
    }
    const user = userEvent.setup();
    await openAudit(AUDIT);
    await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
    expect(await screen.findByRole("tab", { name: /Igitabo cy'igenzura/ })).toBeTruthy();
    expect(await screen.findByRole("columnheader", { name: "Igikorwa" })).toBeTruthy();
  });
});

describe("parseAuditFilters", () => {
  it("reads valid params, ignores invalid ones with a message key, checks the date order", () => {
    const parsed = parseAuditFilters(
      "aaction=admin.access_grant.&arole=auditor&afrom=2026-10-10&ato=2026-10-01&apage=x&acorr=c-1",
    );
    expect(parsed.filters).toEqual({
      action: "admin.access_grant.",
      role: "auditor",
      entity: null,
      from: "2026-10-10",
      to: null,
      correlationId: "c-1",
    });
    expect(parsed.issues.map((i) => i.messageKey)).toEqual([
      "admin:governance.audit.filter.error.dateOrder",
      "admin:governance.audit.filter.error.page",
    ]);
    expect(parseAuditFilters("aaction=drop.table").issues[0]?.field).toBe("action");
  });
});
