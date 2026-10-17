/**
 * Worker follow-ups (HWM-03 task 1): the signed-in worker's follow-ups joined with the patient's
 * display name + synthetic identifier, and the Today selectors. Read through the FND-07
 * repository (`listFollowUps({ assignedWorkerId, facilityIds })`, scope enforced there); the
 * facility filter is ALSO applied here, defensively, so a row of another facility that reached
 * the device never shows.
 *
 * No audit: an aggregated own worklist is not a per-patient read (`listPatients` /
 * `listFollowUps` do not audit; `getPatient` would, so it is not used).
 */
import {
  calendarDaysOverdue,
  dueBucket,
  type DueBucket,
  type FacilityId,
  type FollowUp,
  type Patient,
} from "@laif/domain";
import type { CareRepository } from "@laif/repositories";

export type WorkerScopeInput = { workerId: string; facilityId: FacilityId };

export type WorkerFollowUp = {
  followUp: FollowUp;
  patientName: string;
  patientIdentifier: string;
};

const PAGE_SIZE = 200;

/** Every page of a repository list (the worker slice is small; pages are capped at 200). */
async function allPages<T>(
  load: (page: number) => Promise<{ items: T[]; total: number }>,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    const result = await load(page);
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) return items;
  }
}

/** Patients of the facility, by id (display name + identifier only are used). */
export async function patientIndex(
  repo: Pick<CareRepository, "listPatients">,
  facilityId: string,
): Promise<Map<string, Patient>> {
  const patients = await allPages((page) =>
    repo.listPatients({ facilityIds: [facilityId], page, pageSize: PAGE_SIZE }),
  );
  return new Map(
    patients.filter((p) => p.facilityId === facilityId).map((p) => [p.id as string, p]),
  );
}

export async function listForWorker(
  repo: Pick<CareRepository, "listFollowUps" | "listPatients">,
  { workerId, facilityId }: WorkerScopeInput,
): Promise<WorkerFollowUp[]> {
  const [followUps, patients] = await Promise.all([
    allPages((page) =>
      repo.listFollowUps({
        assignedWorkerId: workerId,
        facilityIds: [facilityId],
        page,
        pageSize: PAGE_SIZE,
      }),
    ),
    patientIndex(repo, facilityId),
  ]);
  return followUps
    .filter((fu) => fu.facilityId === facilityId && fu.assignedWorkerId === workerId)
    .map((followUp) => {
      const patient = patients.get(followUp.patientId);
      return {
        followUp,
        patientName: patient?.displayName ?? "",
        patientIdentifier: patient?.syntheticIdentifier ?? "",
      };
    });
}

export type PrioritisedFollowUp = WorkerFollowUp & {
  bucket: Exclude<DueBucket, "completed">;
  /** Whole Kigali calendar days past the due day (overdue rows only, else 0). */
  daysOverdue: number;
};

const BUCKET_RANK: Record<PrioritisedFollowUp["bucket"], number> = {
  overdue: 0,
  due_today: 1,
  upcoming: 2,
};

/**
 * HWM-03 task 3: open follow-ups ordered overdue (oldest due first) → due today (earliest) →
 * upcoming (earliest); ties broken by the stable follow-up id (never by queue `localSeq`).
 * Purely by due date — no clinical urgency is inferred.
 */
export function prioritiseFollowUps(
  rows: readonly WorkerFollowUp[],
  now: Date,
): PrioritisedFollowUp[] {
  const open: PrioritisedFollowUp[] = [];
  for (const row of rows) {
    const bucket = dueBucket(row.followUp, now);
    if (bucket === "completed") continue;
    open.push({ ...row, bucket, daysOverdue: calendarDaysOverdue(row.followUp, now) });
  }
  return open.sort(
    (a, b) =>
      BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket] ||
      Date.parse(a.followUp.dueAt) - Date.parse(b.followUp.dueAt) ||
      (a.followUp.id < b.followUp.id ? -1 : a.followUp.id > b.followUp.id ? 1 : 0),
  );
}
