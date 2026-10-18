/**
 * `/clinical/patients/:id` (CLN-03): header + tabs Overview · Screenings · Reviews · Referrals &
 * tasks (the last three: CLN-04 `tabs/`).
 *
 * - Out-of-scope id → the repository throws `FORBIDDEN` and appends `access.denied`; the page
 *   shows the permission-denied state with NO patient data (only the URL holds the id).
 * - Unknown id → EmptyState "No synthetic patient with this ID in your facilities".
 * - Success → the repository's own `patient.viewed` sensitive-read audit (one per open; the
 *   query is deduplicated under StrictMode and never refetched on focus).
 * The page `<h1>` (and document title) is "Patient overview", so the name never lands in the
 * browser history.
 */
import type { Patient } from "@laif/domain";
import { EmptyState, PermissionDenied, Tabs, useTx } from "@laif/ui-web";
import { Link, useParams, useSearchParams } from "react-router";

import { PATIENT_TABS, routes, type PatientTab } from "../../app/routes.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { AsyncBoundary } from "../../components/AsyncBoundary.tsx";
import { DuplicateWarning } from "./DuplicateWarning.tsx";
import { usePatient } from "./hooks.ts";
import { PatientHeader } from "./PatientHeader.tsx";
import { PatientOverview } from "./PatientOverview.tsx";
import { ReferralsTasksTab } from "./tabs/ReferralsTasksTab.tsx";
import { ReviewsTab } from "./tabs/ReviewsTab.tsx";
import { ScreeningsTab } from "./tabs/ScreeningsTab.tsx";

export function PatientPage() {
  const t = useTx();
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: PatientTab = (PATIENT_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as PatientTab)
    : "overview";
  const query = usePatient(id);

  const breadcrumbs = [
    { label: t("clinical:nav.patients"), to: routes.patients() },
    { label: t("clinical:nav.patient") },
  ];
  const header = <PageHeader title={t("clinical:nav.patient")} breadcrumbs={breadcrumbs} />;

  const backLink = (
    <Link
      to={routes.patients()}
      className="text-primary-dark target-min inline-flex items-center text-sm font-semibold underline"
    >
      {t("clinical:patients.record.notFound.back")}
    </Link>
  );
  const notFound = (
    <div data-testid="patient-not-found">
      <EmptyState
        icon="search"
        title={t("clinical:patients.record.notFound.title")}
        description={t("clinical:patients.record.notFound.description")}
        action={backLink}
      />
    </div>
  );

  return (
    <>
      {header}
      <AsyncBoundary
        query={query}
        testId="patient"
        loadingLabel={t("clinical:patients.record.loading")}
        skeletonLines={2}
        permissionFallback={
          <div data-testid="permission-denied" data-reason="patient-scope">
            <PermissionDenied
              message={t("clinical:patients.record.denied.body")}
              action={backLink}
            />
          </div>
        }
        isEmpty={(patient) => patient === null}
        emptyFallback={notFound}
        notFoundFallback={notFound}
      >
        {(patient) =>
          patient === null ? notFound : <PatientLoaded patient={patient} initialTab={initialTab} />
        }
      </AsyncBoundary>
    </>
  );
}

function PatientLoaded({ patient, initialTab }: { patient: Patient; initialTab: PatientTab }) {
  const t = useTx();
  return (
    <>
      <div className="space-y-4">
        <PatientHeader patient={patient} />
        <DuplicateWarning patient={patient} />
        <Tabs
          label={t("clinical:patients.record.tabs.label")}
          defaultValue={initialTab}
          tabs={[
            {
              value: "overview",
              label: t("clinical:patients.record.tabs.overview"),
              content: <PatientOverview patient={patient} />,
            },
            {
              value: "screenings",
              label: t("clinical:patients.record.tabs.screenings"),
              content: <ScreeningsTab patient={patient} />,
            },
            {
              value: "reviews",
              label: t("clinical:patients.record.tabs.reviews"),
              content: <ReviewsTab patient={patient} />,
            },
            {
              value: "referralsTasks",
              label: t("clinical:patients.record.tabs.referralsTasks"),
              content: <ReferralsTasksTab patient={patient} />,
            },
          ]}
        />
      </div>
    </>
  );
}
