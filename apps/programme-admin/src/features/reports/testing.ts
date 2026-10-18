/** Test helpers for the ADM-07 report tests (signed-in services + a report loader). */
import type { ReportGranularity } from "@laif/analytics";
import { createMemoryStoreAdapter } from "@laif/repositories";

import type { Tx } from "../../app/persona-labels.ts";
import { createTestServices, signIn } from "../../test/app.tsx";
import { DEFAULT_FILTERS, resolvePeriod, type AdminFilters } from "../filters/filterSchema.ts";
import { loadReportSections } from "./queries.ts";
import type { ReportTemplateId } from "./templates.ts";
import { scopeKeyOf } from "../../lib/queryKeys.ts";

export const TODAY = "2026-10-14";

export async function signedInServices(personaId: string) {
  const store = createMemoryStoreAdapter();
  const services = await createTestServices(store);
  await signIn(services, personaId);
  const t = services.i18n.t as unknown as Tx;
  return { services, t, store };
}

export function filtersOf(patch: Partial<AdminFilters> = {}) {
  const filters: AdminFilters = { ...DEFAULT_FILTERS, ...patch };
  return { filters, period: resolvePeriod(filters, TODAY) };
}

export async function loadReport(
  services: Awaited<ReturnType<typeof signedInServices>>["services"],
  template: ReportTemplateId,
  granularity: ReportGranularity,
  patch: Partial<AdminFilters> = {},
  threshold = 5,
) {
  const state = services.session.getState();
  return loadReportSections({
    client: services.queryClient,
    repo: services.repo,
    access: state.persona === null ? null : { persona: state.persona, grant: state.grant },
    scopeKey: scopeKeyOf(state.grant),
    api: filtersOf(patch),
    threshold,
    template,
    granularity,
    nowIso: services.clock.nowIso(),
  });
}
