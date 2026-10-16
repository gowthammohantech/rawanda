import type { AuditEvent } from "@laif/domain";
import { DISTRICT_IDS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness } from "../testing/harness.ts";

describe("audit service", () => {
  it("district analyst (audit.read_scoped) sees only District Alpha and unbound events", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.analystAlpha });
    const page = await h.repo.listAuditEvents({ pageSize: 200 });
    expect(page.total).toBeGreaterThan(0);
    expect(
      page.items.every((e) => e.districtId === null || e.districtId === DISTRICT_IDS.alpha),
    ).toBe(true);
    const inDistrict = await h.repo.listAuditEvents({ districtIds: [DISTRICT_IDS.alpha] });
    expect(inDistrict.items.every((e) => e.districtId === DISTRICT_IDS.alpha)).toBe(true);
    await expect(
      h.repo.listAuditEvents({ districtIds: [DISTRICT_IDS.beta] }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("auditor (programme-wide audit.read) sees every district; correlation filter narrows a chain", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.auditorProgramme });
    const all = (await h.store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action !== "audit.viewed",
    );
    const page = await h.repo.listAuditEvents({ pageSize: 200 });
    expect(page.total).toBe(all.length);
    const sample = all.find((e) => e.category === "change")!;
    const chain = await h.repo.listAuditEvents({
      correlationId: sample.correlationId,
      pageSize: 200,
    });
    expect(chain.items.every((e) => e.correlationId === sample.correlationId)).toBe(true);
    const byEntity = await h.repo.listAuditEvents({
      entityId: sample.entityId,
      actorRole: sample.actorRole ?? undefined,
    });
    expect(byEntity.items.map((e) => e.id)).toContain(sample.id);
    if (sample.patientId) {
      const byPatient = await h.repo.listAuditEvents({
        patientId: sample.patientId,
        pageSize: 200,
      });
      expect(byPatient.items.every((e) => e.patientId === sample.patientId)).toBe(true);
    }
  });
});
