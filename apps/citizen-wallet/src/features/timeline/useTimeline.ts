/**
 * Timeline hooks (CTZ-06). The timeline is the pure `buildCitizenTimeline` projection over the
 * wallet's existing reads (released results, approved steps incl. acknowledgements, reminders,
 * correction requests) — no second query path, no staff-internal data.
 *
 * - `useCitizenTimeline` runs the four queries and projects them; the simulated reminder
 *   delivery runs on mount / app foreground / demo-clock change, and `refresh`
 *   (pull-to-refresh) runs it first too, so a demo-clock advance shows new rows.
 * - `useTimelineViewLog` writes `citizen.timeline.viewed` once per screen focus.
 * - `useChangeViewLog` writes `citizen.change.viewed` when a "what changed" sheet opens.
 * - `useTimelineFilter` keeps the filter chip in the wallet Zustand store (session-only).
 */
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo } from "react";

import {
  useApprovedInstructions,
  useCorrectionRequests,
  useReleasedObservations,
  useReminders,
} from "../../data/queries.ts";
import { useCitizenRepo } from "../../data/repo.tsx";
import { useWallet } from "../../providers.tsx";
import { useReminderProcessor } from "../reminders/useReminders.ts";
import {
  buildCitizenTimeline,
  type TimelineFilter,
  type TimelineItem,
} from "./buildCitizenTimeline.ts";

export type CitizenTimelineState = {
  items: TimelineItem[] | undefined;
  error: unknown;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
};

export function useCitizenTimeline(patientId: string | null): CitizenTimelineState {
  const observations = useReleasedObservations(patientId);
  const instructions = useApprovedInstructions(patientId);
  const reminders = useReminders(patientId);
  const corrections = useCorrectionRequests(patientId);
  // Simulated delivery on mount, app foreground and demo-clock change (new reminder rows).
  const process = useReminderProcessor(patientId);
  const queries = [observations, instructions, reminders, corrections] as const;

  const items = useMemo(() => {
    if (
      observations.data === undefined ||
      instructions.data === undefined ||
      reminders.data === undefined ||
      corrections.data === undefined
    ) {
      return undefined;
    }
    return buildCitizenTimeline({
      observations: observations.data,
      instructions: instructions.data,
      reminders: reminders.data,
      corrections: corrections.data,
    });
  }, [observations.data, instructions.data, reminders.data, corrections.data]);

  const { refetch: r1 } = observations;
  const { refetch: r2 } = instructions;
  const { refetch: r3 } = reminders;
  const { refetch: r4 } = corrections;
  const refetchAll = useCallback(async () => {
    await Promise.all([r1(), r2(), r3(), r4()]);
  }, [r1, r2, r3, r4]);

  const refresh = useCallback(async () => {
    await process();
    await refetchAll();
  }, [process, refetchAll]);

  return {
    items,
    error: queries.find((q) => q.error)?.error ?? null,
    refresh,
    retry: refetchAll,
  };
}

/** `citizen.timeline.viewed` once per focus of the Timeline tab. */
export function useTimelineViewLog(patientId: string | null): void {
  const repo = useCitizenRepo();
  useFocusEffect(
    useCallback(() => {
      if (patientId === null) return;
      void repo.recordTimelineViewed(patientId).catch(() => undefined);
    }, [repo, patientId]),
  );
}

/** Records `citizen.change.viewed` for one opened change sheet. */
export function useChangeViewLog(patientId: string | null): (observationId: string) => void {
  const repo = useCitizenRepo();
  return useCallback(
    (observationId: string) => {
      if (patientId === null) return;
      void repo.recordChangeViewed(patientId, observationId).catch(() => undefined);
    },
    [repo, patientId],
  );
}

export function useTimelineFilter(): [TimelineFilter, (filter: TimelineFilter) => void] {
  const filter = useWallet((s) => s.timelineFilter);
  const setFilter = useWallet((s) => s.setTimelineFilter);
  return [filter, setFilter];
}
