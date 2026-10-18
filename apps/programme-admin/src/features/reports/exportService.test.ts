/**
 * ADM-07 `requestExport`: capability denial (facility manager), scope denial (District Alpha
 * analyst forcing District Beta in state), idempotency (double click / retry → one ExportAudit,
 * one `export.generated`, identical bytes) and the audit payloads.
 */
import type { ExportReason } from "@laif/contracts";
import { DISTRICT_IDS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it, vi } from "vitest";

import { auditEvents } from "../../test/app.tsx";
import { requestExport, type ExportRequestInput } from "./exportService.ts";
import { filtersOf, signedInServices } from "./testing.ts";

const reason: ExportReason = {
  reasonCode: "district_meeting",
  reasonText: "",
  acknowledgeAggregateOnly: true,
};

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;

async function setup(personaId: string) {
  const { services, t, store } = await signedInServices(personaId);
  const download = vi.fn<(text: string, fileName: string) => void>();
  const deps = {
    repo: services.repo,
    session: services.session,
    client: services.queryClient,
    threshold: 5,
    nowIso: services.clock.nowIso(),
    t,
    download,
  };
  const input = (patch: Partial<ExportRequestInput> = {}): ExportRequestInput => ({
    template: "programme_summary",
    granularity: "facility",
    ...filtersOf(),
    reason,
    idempotencyKey: uuid(),
    exportId: uuid(),
    generatedAt: services.clock.now(),
    ...patch,
  });
  return { services, deps, download, input, store };
}

const ofExport = <T extends { entityType: string }>(events: T[]) =>
  events.filter((e) => e.entityType === "export_audit");

describe("requestExport", () => {
  it("generates once per key: double click and retry → one ExportAudit, one export.generated", async () => {
    const { services, deps, download, input, store } = await setup(PERSONA_IDS.analystAlpha);
    const req = input();
    const [a, b] = await Promise.all([requestExport(deps, req), requestExport(deps, req)]);
    expect(a).toBe(b);
    const retry = await requestExport(deps, req);
    expect(retry.replayed).toBe(true);
    expect(retry.audit.id).toBe(req.exportId);
    const audits = await services.repo.listExportAudits({ idempotencyKey: req.idempotencyKey });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      status: "generated",
      template: "programme_summary",
      granularity: "facility",
      reasonCode: "district_meeting",
      scope: { districtIds: [DISTRICT_IDS.alpha] },
    });
    expect(download).toHaveBeenCalledTimes(2);
    expect(download.mock.calls[0]).toEqual(download.mock.calls[1]);
    const [text, fileName] = download.mock.calls[0]!;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain(`# export_id=${req.exportId}`);
    expect(fileName).toBe(audits[0]!.fileName);
    expect(ofExport(await auditEvents(store, "export.generated"))).toHaveLength(1);
  });

  it("audit payloads: export.requested (key) and export.generated (counts, checksum, reason)", async () => {
    const { services, deps, input, store } = await setup(PERSONA_IDS.analystAlpha);
    const req = input({
      reason: { ...reason, reasonCode: "other", reasonText: "Quarterly NCD pack" },
    });
    const result = await requestExport(deps, req);
    const requested = await auditEvents(store, "export.requested");
    const generated = ofExport(await auditEvents(store, "export.generated"));
    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatchObject({
      actorId: PERSONA_IDS.analystAlpha,
      actorRole: "district_analyst",
      justification: "Quarterly NCD pack",
      changeSummary: { idempotencyKey: req.idempotencyKey, template: "programme_summary" },
    });
    expect(generated).toHaveLength(1);
    const session = services.session.getState().session!;
    expect(generated[0]).toMatchObject({
      entityId: req.exportId,
      correlationId: session.correlationId,
      justification: "Quarterly NCD pack",
      changeSummary: {
        reasonCode: "other",
        rowCount: result.audit.rowCount,
        suppressedCells: result.audit.suppressedCells,
        sha256: result.audit.sha256,
        idempotencyKey: req.idempotencyKey,
      },
    });
    expect(requested[0]?.correlationId).toBe(session.correlationId);
  });

  it("facility manager: FORBIDDEN, export.denied + a denied history row, no file", async () => {
    const { services, deps, download, input, store } = await setup(PERSONA_IDS.fmgrAlpha1);
    await expect(requestExport(deps, input())).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "ROLE",
    });
    expect(download).not.toHaveBeenCalled();
    const history = await services.repo.listExportAudits();
    expect(history.map((r) => [r.status, r.deniedReason])).toEqual([["denied", "capability"]]);
    const denied = ofExport(await auditEvents(store, "export.denied"));
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({
      outcome: "denied",
      actorRole: "facility_manager",
      changeSummary: { denial: "capability" },
    });
  });

  it("District Alpha analyst forcing District Beta in state: FORBIDDEN, denied row, no file", async () => {
    const { services, deps, download, input } = await setup(PERSONA_IDS.analystAlpha);
    await expect(
      requestExport(deps, input(filtersOf({ district: DISTRICT_IDS.beta }))),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "SCOPE" });
    expect(download).not.toHaveBeenCalled();
    const history = await services.repo.listExportAudits();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      status: "denied",
      deniedReason: "scope",
      scope: { districtIds: [DISTRICT_IDS.beta] },
    });
    expect(history.some((r) => r.status === "generated")).toBe(false);
  });

  it("rejects a missing acknowledgement before anything is written", async () => {
    const { services, deps, input } = await setup(PERSONA_IDS.analystAlpha);
    await expect(
      requestExport(
        deps,
        input({ reason: { ...reason, acknowledgeAggregateOnly: false as unknown as true } }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await services.repo.listExportAudits()).toEqual([]);
  });
});
