/** CLN-02 `useAuditedRead`: one client audit event per entity per mount (StrictMode-safe). */
import type { AuditEvent } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { createTestClinicalRepo } from "../../test/test-repository.ts";
import { RepositoryProvider } from "../RepositoryProvider.tsx";
import { useAuditedRead } from "../useAuditedRead.ts";

describe("useAuditedRead", () => {
  it("records once per entity per mount", async () => {
    const { repo, store } = await createTestClinicalRepo({
      personaId: PERSONA_IDS.clinAlpha1,
      facilityId: FACILITY_IDS.alpha1,
    });
    const referralId = SEED_ANCHORS.OVERDUE_REFERRAL.referralId;
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <StrictMode>
        <RepositoryProvider repo={repo}>{children}</RepositoryProvider>
      </StrictMode>
    );
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) =>
        useAuditedRead({ action: "referral.viewed", entityType: "referral", entityId: id }),
      { wrapper, initialProps: { id: null as string | null } },
    );
    rerender({ id: referralId });
    rerender({ id: referralId });
    const viewed = async () =>
      (await store.getAll<AuditEvent>("auditEvents")).filter(
        (e) => e.action === "referral.viewed" && e.entityId === referralId,
      );
    await waitFor(async () => expect(await viewed()).toHaveLength(1));
    expect((await viewed())[0]?.actorId).toBe(PERSONA_IDS.clinAlpha1);
  });
});
