/**
 * Patient record › Screenings tab (CLN-04). Loading → card skeletons; empty → "No screenings
 * recorded for this synthetic patient"; error → retry. Opening the tab records ONE
 * `screening.history_viewed` per patient per mount (sensitive read, `useAuditedRead`; the tab
 * content mounts only while the tab is active). The amend action is capability-based
 * (`screening.amend`) and disabled while the simulated offline fault is on.
 */
import type { Patient, Screening } from "@laif/domain";
import { EmptyState, LoadingSkeleton, useTx } from "@laif/ui-web";
import { useMemo, useState } from "react";

import { useDemoTools } from "../../../app/demo-tools.tsx";
import { QueryErrorState } from "../../../components/QueryErrorState.tsx";
import { useAuditedRead } from "../../../data/useAuditedRead.ts";
import { ACTION_CAPABILITY } from "../../../session/capabilities.ts";
import { useSession } from "../../../session/useSession.ts";
import { usePatientReviews, useScreenings } from "../../timeline/hooks.ts";
import { toScreeningEntries } from "../../timeline/model.ts";
import { ScreeningTimeline } from "../../timeline/ScreeningTimeline.tsx";

export function ScreeningsTab({ patient }: { patient: Patient }) {
  const t = useTx();
  const { can } = useSession();
  const { faultConfig } = useDemoTools();
  const screenings = useScreenings(patient.id);
  const reviews = usePatientReviews(patient.id);
  const [highlight, setHighlight] = useState<{
    screeningId: string;
    amendmentId: string | null;
  } | null>(null);

  useAuditedRead({
    action: "screening.history_viewed",
    entityType: "patient",
    entityId: patient.id,
    patientId: patient.id,
    facilityId: patient.facilityId,
    enabled: screenings.isSuccess,
  });

  const entries = useMemo(
    () => toScreeningEntries(screenings.data?.screenings ?? [], reviews.data ?? []),
    [screenings.data, reviews.data],
  );

  if (screenings.isPending) {
    return (
      <div
        aria-busy="true"
        aria-label={t("clinical:timeline.screenings.loading")}
        className="space-y-3"
      >
        <LoadingSkeleton variant="card" lines={3} />
        <LoadingSkeleton variant="card" lines={3} />
      </div>
    );
  }
  if (screenings.isError) {
    return <QueryErrorState error={screenings.error} onRetry={() => void screenings.refetch()} />;
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="activity"
        title={t("clinical:timeline.screenings.empty")}
        description={t("clinical:timeline.screenings.emptyDescription")}
      />
    );
  }

  return (
    <ScreeningTimeline
      entries={entries}
      nowIso={screenings.data.nowIso}
      canAmend={can(ACTION_CAPABILITY.amendScreening)}
      offline={faultConfig.offline}
      highlight={highlight}
      onAmended={(saved: Screening, amendmentId) =>
        setHighlight({ screeningId: saved.id, amendmentId })
      }
    />
  );
}
