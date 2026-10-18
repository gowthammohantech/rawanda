/**
 * `/clinical/referrals` (CLN-08, PRD/FRD CL-06): header + KPI strip (Open · Overdue · Completed
 * this month · Median days to completion (demo)) + tabs `Open N · Overdue N · Completed N ·
 * Cancelled N · All N` + `ReferralTable` + `ReferralDrawer` (`?id=`, deep-linkable).
 *
 * URL state `?tab=&facility=&q=&id=` (`facility` = destination facility). Counts come from
 * `countReferrals` with the SAME filter as the rows of each tab, so badge == rows. Overdue is a
 * derived badge only (never a stored status). Create referral needs `referral.manage`
 * (the route itself is guarded by it, CLN-01); offline disables writes, the list stays readable.
 */
import { FACILITIES_REFERENCE } from "@laif/mock-data";
import {
  Button,
  EmptyState,
  KpiStrip,
  LoadingSkeleton,
  SearchInput,
  Select,
  Tabs,
  useTx,
  type KpiItem,
  type TabItem,
} from "@laif/ui-web";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { useDemoTools } from "../../app/demo-tools.tsx";
import { facilityLabel } from "../../app/persona-labels.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { AsyncBoundary, whenReady } from "../../components/AsyncBoundary.tsx";
import { useSession } from "../../session/useSession.ts";
import { useDemoNow } from "../decision/hooks.ts";
import { useDebouncedValue } from "../patients/hooks.ts";
import { CreateReferralDialog } from "./CreateReferralDialog.tsx";
import {
  UNFILTERED_REFERRAL_SCOPE,
  useCompletedReferrals,
  useReferralCounts,
  useReferralPatients,
  useReferrals,
} from "./hooks.ts";
import {
  completedThisMonth,
  medianDaysToCompletion,
  parseReferralParams,
  patchReferralParams,
  REFERRAL_QUERY_MAX,
  REFERRAL_TABS,
  tabCount,
  type ReferralParamsPatch,
  type ReferralTab,
} from "./model.ts";
import { ReferralDrawer } from "./ReferralDrawer.tsx";
import { ReferralTable } from "./ReferralTable.tsx";
import { KPI_STRIP_CLASS } from "../../components/responsive.ts";

const FACILITY_IDS = FACILITIES_REFERENCE.map((f) => f.id as string);

const isTab = (value: string): value is ReferralTab =>
  (REFERRAL_TABS as readonly string[]).includes(value);

export function ReferralsPage() {
  const t = useTx();
  const { can, activeFacilityId } = useSession();
  const { faultConfig } = useDemoTools();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = parseReferralParams(searchParams, FACILITY_IDS);
  const scope = useMemo(
    () => ({ facility: params.facility, q: params.q }),
    [params.facility, params.q],
  );

  const now = useDemoNow();
  const counts = useReferralCounts(scope);
  const kpiCounts = useReferralCounts(UNFILTERED_REFERRAL_SCOPE);
  const completed = useCompletedReferrals();
  const rows = useReferrals(scope, params.tab);
  const patients = useReferralPatients();
  const [creating, setCreating] = useState(false);

  const update = (patch: ReferralParamsPatch, replace = false) =>
    setSearchParams(patchReferralParams(searchParams, patch), { replace });

  // Search box → URL once typing settles.
  const [text, setText] = useState(params.q);
  const debounced = useDebouncedValue(text);
  useEffect(() => {
    const next = debounced.trim();
    if (next !== params.q) update({ q: next }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the typed value settles
  }, [debounced]);

  const nowIso = now.data;
  const facilityName = activeFacilityId === null ? "" : facilityLabel(activeFacilityId, t);
  const median = completed.data === undefined ? null : medianDaysToCompletion(completed.data);

  const kpis: KpiItem[] = [
    {
      id: "open",
      label: t("clinical:referrals.kpi.open"),
      value: kpiCounts.data === undefined ? "—" : tabCount(kpiCounts.data, "open"),
    },
    {
      id: "overdue",
      label: t("clinical:referrals.kpi.overdue"),
      value: kpiCounts.data === undefined ? "—" : tabCount(kpiCounts.data, "overdue"),
      tone: "danger",
      hint: t("clinical:referrals.kpi.overdueHint"),
    },
    {
      id: "completedMonth",
      label: t("clinical:referrals.kpi.completedMonth"),
      value:
        completed.data === undefined || nowIso === undefined
          ? "—"
          : completedThisMonth(completed.data, nowIso),
      tone: "positive",
    },
    {
      id: "median",
      label: t("clinical:referrals.kpi.medianDays"),
      value: median === null ? "—" : t("clinical:referrals.kpi.days", { count: median }),
      hint: t("clinical:referrals.kpi.medianHint"),
    },
  ];

  const tabs: TabItem[] = REFERRAL_TABS.map((tab) => ({
    value: tab,
    label: t(`clinical:referrals.tabs.${tab}`),
    count: counts.data === undefined ? "…" : tabCount(counts.data, tab),
    ...(tab === params.tab
      ? {
          content: (
            <AsyncBoundary
              query={whenReady(rows, nowIso !== undefined)}
              testId="referrals"
              loadingLabel={t("clinical:referrals.loading")}
              skeleton="lines"
              skeletonLines={6}
            >
              {(data) => (
                <ReferralTable
                  caption={t("clinical:referrals.table.caption", {
                    tab: t(`clinical:referrals.tabs.${tab}`),
                  })}
                  rows={data}
                  patients={patients.data}
                  nowIso={nowIso ?? ""}
                  onOpen={(referral) => update({ id: referral.id })}
                  emptyState={
                    <div data-testid="referrals-empty">
                      <EmptyState
                        icon="external"
                        title={
                          params.q !== "" || params.facility !== null
                            ? t("clinical:referrals.empty.filtered")
                            : t(`clinical:referrals.empty.${tab}`, { facility: facilityName })
                        }
                        {...(params.q !== "" || params.facility !== null
                          ? {
                              onClearFilters: () => {
                                setText("");
                                update({ q: "", facility: null });
                              },
                            }
                          : {})}
                      />
                    </div>
                  }
                />
              )}
            </AsyncBoundary>
          ),
        }
      : {}),
  }));

  const offline = faultConfig.offline;

  return (
    <div className="space-y-5" data-testid="referrals-page">
      <PageHeader
        title={t("clinical:referrals.title")}
        subtitle={t("clinical:referrals.subtitle", { facility: facilityName })}
        {...(can("referral.manage")
          ? {
              actions: (
                <Button
                  icon="plus"
                  disabled={offline || nowIso === undefined}
                  data-testid="create-referral"
                  onClick={() => setCreating(true)}
                >
                  {t("clinical:referrals.actions.create")}
                </Button>
              ),
            }
          : {})}
      />

      {kpiCounts.isPending ? (
        <div role="group" aria-busy="true" aria-label={t("clinical:referrals.loading")}>
          <LoadingSkeleton variant="lines" lines={2} />
        </div>
      ) : (
        <div data-testid="referral-kpis">
          <KpiStrip
            className={KPI_STRIP_CLASS}
            items={kpis}
            label={t("clinical:referrals.kpi.label")}
          />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3" data-testid="referral-toolbar">
        <div className="min-w-56 flex-1">
          <SearchInput
            label={t("clinical:referrals.filters.search")}
            placeholder={t("clinical:referrals.filters.searchPlaceholder")}
            value={text}
            maxLength={REFERRAL_QUERY_MAX}
            onValueChange={setText}
            data-testid="referral-search"
          />
        </div>
        <div className="w-64">
          <Select
            label={t("clinical:referrals.filters.destination")}
            value={params.facility ?? ""}
            options={[
              { value: "", label: t("clinical:referrals.filters.anyDestination") },
              ...FACILITIES_REFERENCE.map((f) => ({ value: f.id, label: facilityLabel(f.id, t) })),
            ]}
            onChange={(event) => update({ facility: event.target.value || null })}
            data-testid="referral-destination-filter"
          />
        </div>
      </div>

      <div data-testid="referral-tabs">
        <Tabs
          tabs={tabs}
          label={t("clinical:referrals.tabs.label")}
          value={params.tab}
          onValueChange={(next) => {
            if (isTab(next)) update({ tab: next });
          }}
        />
      </div>

      {nowIso === undefined ? null : (
        <ReferralDrawer
          id={params.id}
          onClose={() => update({ id: null })}
          nowIso={nowIso}
          patients={patients.data}
        />
      )}
      {creating && nowIso !== undefined ? (
        <CreateReferralDialog
          open
          onOpenChange={(open) => {
            if (!open) setCreating(false);
          }}
          nowIso={nowIso}
          onSaved={(referral) => update({ id: referral.id })}
        />
      ) : null}
    </div>
  );
}
