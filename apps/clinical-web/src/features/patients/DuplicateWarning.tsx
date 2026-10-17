/**
 * Possible-duplicate warning (CLN-03 task 8, FRD §10 duplicate identity): amber callout with
 * icon + text. Lists only candidates in the active facility (links to their records); others
 * are counted, never named. Records are never merged automatically — there is no merge action.
 */
import type { Patient } from "@laif/domain";
import { Icon, useTx } from "@laif/ui-web";
import { Link } from "react-router";

import { routes } from "../../app/routes.ts";
import { useDuplicateCandidates } from "./hooks.ts";

export function DuplicateWarning({ patient }: { patient: Patient }) {
  const t = useTx();
  const candidates = useDuplicateCandidates(patient);
  if (patient.duplicateCandidateIds.filter((id) => id !== patient.id).length === 0) return null;
  const data = candidates.data;
  return (
    <section
      role="alert"
      data-testid="duplicate-warning"
      aria-labelledby="duplicate-warning-title"
      className="border-risk-warning/25 bg-risk-warning-soft text-ink flex gap-3 rounded-lg border p-4"
    >
      <Icon name="alert" size={20} className="text-risk-warning mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-2 text-sm">
        <h2
          id="duplicate-warning-title"
          className="text-risk-warning m-0 text-[15px] font-semibold"
        >
          {t("clinical:patients.record.duplicate.title")}
        </h2>
        <p className="m-0">{t("clinical:patients.record.duplicate.body")}</p>
        {data !== undefined && data.inScope.length > 0 ? (
          <div>
            <p className="m-0 font-semibold">
              {t("clinical:patients.record.duplicate.candidates")}
            </p>
            <ul className="m-0 list-disc ps-5">
              {data.inScope.map((candidate) => (
                <li key={candidate.id}>
                  <Link
                    to={routes.patient(candidate.id)}
                    className="text-primary-dark font-semibold underline"
                  >
                    {candidate.displayName}
                  </Link>{" "}
                  <span className="font-mono text-[13px]">({candidate.syntheticIdentifier})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {data !== undefined && data.outOfScopeCount > 0 ? (
          <p className="m-0" data-testid="duplicate-out-of-scope">
            {t("clinical:patients.record.duplicate.outOfScopeCount", {
              count: data.outOfScopeCount,
            })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
