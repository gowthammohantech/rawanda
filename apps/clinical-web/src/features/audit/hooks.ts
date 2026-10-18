/**
 * Audit explorer data (CLN-10 deliverable `hooks.ts`). The repository actor is narrowed to the
 * active facility (CLN-02), and `listAuditEvents` enforces the facility scope itself, so every
 * list below only holds in-scope rows (plus the actor's own unbound / denied events).
 *
 * - `useAuditEvents(filter)` — one page (50) of the filtered log, newest first. The repository
 *   appends `audit.viewed` (de-duplicated per actor per demo minute) with the filter summary.
 * - `useCorrelationTrail(event)` — every event sharing the correlation id, plus the history of the
 *   linked review / referral / follow-up entities of that chain (WF-01 step 10), oldest first.
 * - `useAuditPatients()` — in-scope patients (synthetic id lookup; display names are only used to
 *   guard the export, never written to it).
 * - `useExportAudit()` — `performAuditExport` with fixed EN + RW translators.
 */
import type { AuditEvent } from "@laif/domain";
import { useI18nInstance } from "@laif/i18n";
import type { AuditFilterInput } from "@laif/repositories";
import type { TranslationKey, TranslationValues } from "@laif/ui-web";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { clinicalKeys } from "../../data/queryKeys.ts";
import { useRepository } from "../../data/useRepository.ts";
import { useSession } from "../../session/useSession.ts";
import { useReferralPatients } from "../referrals/hooks.ts";
import { performAuditExport, type AuditExportRequest } from "./exportAuditCsv.ts";
import { summaryRecord } from "./model.ts";

function useFac(): string {
  return useSession().activeFacilityId ?? "none";
}

export function useAuditEvents(filter: AuditFilterInput, enabled = true) {
  const repo = useRepository();
  return useQuery({
    queryKey: clinicalKeys.audit(useFac(), filter),
    queryFn: () => repo.listAuditEvents(filter),
    placeholderData: keepPreviousData,
    enabled,
  });
}

const LINKED_ENTITY_TYPES: ReadonlySet<string> = new Set(["review", "referral", "follow_up"]);
const LINK_KEYS = ["reviewId", "referralId", "followUpId"] as const;

async function listAll(
  load: (page: number) => Promise<{ items: AuditEvent[]; total: number }>,
): Promise<AuditEvent[]> {
  const items: AuditEvent[] = [];
  for (let page = 1; ; page += 1) {
    const result = await load(page);
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) return items;
  }
}

/**
 * Oldest first. Events written in ONE transaction share `occurredAt` (and ids are random), so ties
 * follow the WF-01 chain: review → referral → follow-up → task → anything else.
 */
const CHAIN_RANK: Readonly<Record<string, number>> = {
  review: 0,
  referral: 1,
  follow_up: 2,
  care_task: 3,
};
export function compareTrail(a: AuditEvent, b: AuditEvent): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
  const rank = (e: AuditEvent) => CHAIN_RANK[e.entityType] ?? 4;
  return rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function useCorrelationTrail(event: AuditEvent | null) {
  const repo = useRepository();
  return useQuery({
    queryKey: clinicalKeys.audit(useFac(), {
      trail: event?.correlationId ?? "",
      entity: event?.entityId ?? "",
    }),
    enabled: event !== null,
    queryFn: async (): Promise<AuditEvent[]> => {
      if (event === null) return [];
      const chain = await listAll((page) =>
        repo.listAuditEvents({ correlationId: event.correlationId, page, pageSize: 200 }),
      );
      const linked = new Set<string>();
      for (const e of [event, ...chain]) {
        if (LINKED_ENTITY_TYPES.has(e.entityType)) linked.add(e.entityId);
        for (const key of LINK_KEYS) {
          const value = summaryRecord(e.changeSummary)[key];
          if (typeof value === "string") linked.add(value);
        }
      }
      const byId = new Map(chain.map((e) => [e.id, e]));
      for (const entityId of linked) {
        const history = await listAll((page) =>
          repo.listAuditEvents({ entityId, page, pageSize: 200 }),
        );
        for (const e of history) {
          // Sensitive reads of the entities are not part of the decision chain.
          if (e.category === "access" && e.correlationId !== event.correlationId) continue;
          byId.set(e.id, e);
        }
      }
      return [...byId.values()].sort(compareTrail);
    },
  });
}

export const useAuditPatients = useReferralPatients;

type Tx = (key: TranslationKey, values?: TranslationValues) => string;

export function useExportAudit() {
  const repo = useRepository();
  const queryClient = useQueryClient();
  const { i18n } = useI18nInstance();
  const fac = useFac();
  return useCallback(
    async (request: AuditExportRequest) => {
      const fixed = (lng: "en" | "rw"): Tx => {
        const t = i18n.getFixedT(lng) as unknown as (k: string, v?: TranslationValues) => string;
        return (key, values) => t(key, values);
      };
      try {
        return await performAuditExport({ repo, t: { en: fixed("en"), rw: fixed("rw") } }, request);
      } finally {
        await queryClient.invalidateQueries({ queryKey: ["clinical", fac, "audit"] });
      }
    },
    [repo, queryClient, i18n, fac],
  );
}
