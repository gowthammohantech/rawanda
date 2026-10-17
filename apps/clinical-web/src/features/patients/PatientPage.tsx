/**
 * `/clinical/patients/:id` (CLN-03): header + tabs Overview · Screenings · Reviews · Referrals &
 * tasks (the last three are filled by CLN-04+).
 *
 * - Out-of-scope id → the repository throws `FORBIDDEN` and appends `access.denied`; the page
 *   shows the permission-denied state with NO patient data (only the URL holds the id).
 * - Unknown id → EmptyState "No synthetic patient with this ID in your facilities".
 * - Success → the repository's own `patient.viewed` sensitive-read audit (one per open; the
 *   query is deduplicated under StrictMode and never refetched on focus).
 * The page `<h1>` (and document title) is "Patient overview", so the name never lands in the
 * browser history.
 */
import { EmptyState, LoadingSkeleton, PermissionDenied, Tabs, useTx } from "@laif/ui-web";
import { Link, useParams } from "react-router";

import { routes } from "../../app/routes.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { QueryErrorState } from "../../components/QueryErrorState.tsx";
import { toClinicalError } from "../../data/errors.ts";
import { DuplicateWarning } from "./DuplicateWarning.tsx";
import { usePatient } from "./hooks.ts";
import { PatientHeader } from "./PatientHeader.tsx";
import { PatientOverview } from "./PatientOverview.tsx";

function TabPlaceholder() {
  const t = useTx();
  return (
    <EmptyState
      icon="clock"
      title={t("clinical:placeholder.comingSoon", { phase: "CLN-04" })}
      description={t("clinical:placeholder.description")}
    />
  );
}

export function PatientPage() {
  const t = useTx();
  const { id = "" } = useParams();
  const query = usePatient(id);

  const breadcrumbs = [
    { label: t("clinical:nav.patients"), to: routes.patients() },
    { label: t("clinical:nav.patient") },
  ];
  const header = <PageHeader title={t("clinical:nav.patient")} breadcrumbs={breadcrumbs} />;

  if (query.isPending) {
    return (
      <>
        {header}
        <div aria-busy="true" aria-label={t("clinical:patients.record.loading")}>
          <LoadingSkeleton variant="card" lines={2} />
        </div>
      </>
    );
  }

  if (query.isError) {
    const error = toClinicalError(query.error);
    return (
      <>
        {header}
        {error.code === "FORBIDDEN" ? (
          <div data-testid="permission-denied" data-reason="patient-scope">
            <PermissionDenied
              message={t("clinical:patients.record.denied.body")}
              action={
                <Link
                  to={routes.patients()}
                  className="text-primary-dark target-min inline-flex items-center text-sm font-semibold underline"
                >
                  {t("clinical:patients.record.notFound.back")}
                </Link>
              }
            />
          </div>
        ) : (
          <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </>
    );
  }

  const patient = query.data;
  if (patient === null) {
    return (
      <>
        {header}
        <div data-testid="patient-not-found">
          <EmptyState
            icon="search"
            title={t("clinical:patients.record.notFound.title")}
            description={t("clinical:patients.record.notFound.description")}
            action={
              <Link
                to={routes.patients()}
                className="text-primary-dark target-min inline-flex items-center text-sm font-semibold underline"
              >
                {t("clinical:patients.record.notFound.back")}
              </Link>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="space-y-4">
        <PatientHeader patient={patient} />
        <DuplicateWarning patient={patient} />
        <Tabs
          label={t("clinical:patients.record.tabs.label")}
          defaultValue="overview"
          tabs={[
            {
              value: "overview",
              label: t("clinical:patients.record.tabs.overview"),
              content: <PatientOverview patient={patient} />,
            },
            {
              value: "screenings",
              label: t("clinical:patients.record.tabs.screenings"),
              content: <TabPlaceholder />,
            },
            {
              value: "reviews",
              label: t("clinical:patients.record.tabs.reviews"),
              content: <TabPlaceholder />,
            },
            {
              value: "referralsTasks",
              label: t("clinical:patients.record.tabs.referralsTasks"),
              content: <TabPlaceholder />,
            },
          ]}
        />
      </div>
    </>
  );
}
