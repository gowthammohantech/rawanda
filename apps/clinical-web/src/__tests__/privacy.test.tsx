/**
 * CLN-11 task 6 privacy: browsing the clinical screens never puts a patient display name into a
 * TanStack query key (what React Query devtools would show) nor into an audit `changeSummary`.
 * The full Scenario 1 version of the audit check runs against the production build in
 * `e2e/full-pathway.spec.ts`; the CSV check lives in `exportAuditCsv.test.ts`.
 *
 * Known, accepted exception: a search box's own typed text is part of that search's key (the
 * user's input, in memory only; audit events record only its length).
 */
import type { AuditEvent } from "@laif/domain";
import { createSeed, FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { routes } from "../app/routes.ts";
import { renderApp } from "../test/render-app.tsx";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const names = createSeed()
  .patients.map((p) => p.displayName)
  .filter((n) => n.length > 0);

describe("privacy", () => {
  it("query keys and audit change summaries carry no patient display names", async () => {
    const app = await renderApp({ path: routes.queue(), signIn: CLINICIAN, strict: false });
    for (const path of [
      routes.patients(),
      routes.review(SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId),
      routes.patient(SEED_ANCHORS.WF01_FLAGGED_REVIEW.patientId),
      routes.referrals(),
      routes.tasks(),
      routes.audit(),
    ]) {
      await act(async () => {
        await app.router.navigate(path);
      });
      await waitFor(() => expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1));
    }
    const keys = app.services.queryClient
      .getQueryCache()
      .getAll()
      .map((query) => JSON.stringify(query.queryKey));
    expect(keys.length).toBeGreaterThan(5);
    expect(names.filter((name) => keys.some((key) => key.includes(name)))).toEqual([]);

    const audit = await app.store.getAll<AuditEvent>("auditEvents");
    const summaries = audit.map((e) => JSON.stringify(e.changeSummary ?? {}));
    expect(names.filter((name) => summaries.some((s) => s.includes(name)))).toEqual([]);
  });
});
