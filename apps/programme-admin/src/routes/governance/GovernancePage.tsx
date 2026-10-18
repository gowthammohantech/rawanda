/**
 * `/admin/governance?tab=rulesets|audit|access|roles` (ADM-08, PA-08, spec §2.3 "demo ruleset
 * history, event audit, access simulation"). Four tabs with counts in the labels (shown once
 * loaded); the tab lives in the URL (`?tab=`, default `rulesets`; an unknown value falls back).
 *
 * Access: the route needs `audit.read` or `audit.read_scoped` (`RequireCapability`; the facility
 * manager gets the 403). Rulesets need `metrics.read`; Audit log / Access & exports follow the
 * route; Roles & access is visible to all and editable only with `roles.configure`.
 */
import { checkAccess, type Permission } from "@laif/auth-demo";
import { InfoCallout, MicroLabel, PageHeader, Tabs, useTx, type TabItem } from "@laif/ui-web";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";

import { useAdminSession, useSessionStore } from "../../app/providers.tsx";
import { useOnline } from "../../app/useOnline.ts";
import { AccessReport } from "../../features/governance/AccessReport.tsx";
import { AccessSimulator } from "../../features/governance/AccessSimulator.tsx";
import { AuditExplorer } from "../../features/governance/AuditExplorer.tsx";
import { GrantTable } from "../../features/governance/GrantTable.tsx";
import { useAuditTotal, useGrants, useRulesetHistory } from "../../features/governance/queries.ts";
import { RulesetHistory } from "../../features/governance/RulesetHistory.tsx";
import { useExportHistory } from "../../features/reports/queries.ts";
import { useDocumentTitle } from "../useDocumentTitle.ts";

export const GOVERNANCE_TABS = ["rulesets", "audit", "access", "roles"] as const;
export type GovernanceTab = (typeof GOVERNANCE_TABS)[number];

const TAB_PERMISSIONS: Record<GovernanceTab, readonly Permission[]> = {
  rulesets: ["metrics.read"],
  audit: ["audit.read", "audit.read_scoped"],
  access: ["audit.read", "audit.read_scoped"],
  roles: [],
};

export function isGovernanceTab(value: string | null): value is GovernanceTab {
  return value !== null && (GOVERNANCE_TABS as readonly string[]).includes(value);
}

export function GovernancePage() {
  const t = useTx();
  const store = useSessionStore();
  useAdminSession((s) => s.grant);
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  useDocumentTitle(t("admin:governance.title"));

  const actor = store.actor();
  const allowed = (tab: GovernanceTab) =>
    TAB_PERMISSIONS[tab].length === 0 ||
    (actor !== null && TAB_PERMISSIONS[tab].some((p) => checkAccess(actor, p).allowed));
  const requested = params.get("tab");
  const visible = GOVERNANCE_TABS.filter(allowed);
  const tab: GovernanceTab =
    isGovernanceTab(requested) && visible.includes(requested) ? requested : (visible[0] ?? "roles");

  const rulesets = useRulesetHistory();
  const auditTotal = useAuditTotal();
  const exports = useExportHistory();
  const grants = useGrants();

  const counts: Record<GovernanceTab, number | undefined> = {
    rulesets: rulesets.data?.length,
    audit: auditTotal.data,
    access: exports.data?.length,
    roles: grants.data?.length,
  };
  const content: Record<GovernanceTab, ReactNode> = {
    rulesets: <RulesetHistory />,
    audit: <AuditExplorer />,
    access: (
      <div className="flex flex-col gap-4">
        <AccessSimulator />
        <AccessReport />
      </div>
    ),
    roles: <GrantTable />,
  };
  const tabs: TabItem[] = visible.map((value) => ({
    value,
    label: t(`admin:governance.tab.${value}`),
    ...(counts[value] === undefined ? {} : { count: counts[value] }),
    content: value === tab ? content[value] : null,
  }));

  return (
    <div className="flex flex-col gap-4" data-testid="governance-page">
      <div>
        <MicroLabel as="p" className="text-primary-dark">
          {t("admin:governance.eyebrow")}
        </MicroLabel>
        <PageHeader title={t("admin:governance.title")} subtitle={t("admin:governance.subtitle")} />
      </div>
      <InfoCallout icon="shield">{t("admin:governance.tamperNote")}</InfoCallout>
      {online ? null : (
        <InfoCallout title={t("admin:governance.offline.title")} icon="wifi-off">
          {t("admin:governance.offline.body")}
        </InfoCallout>
      )}
      <Tabs
        label={t("admin:governance.tabsLabel")}
        tabs={tabs}
        value={tab}
        onValueChange={(value) => {
          // Changing tab drops the other tabs' params (audit filters stay with the audit tab).
          const next = new URLSearchParams(value === "audit" ? params : undefined);
          for (const name of ["district", "facility"]) {
            const v = params.get(name);
            if (v) next.set(name, v);
          }
          next.set("tab", value);
          setParams(next);
        }}
      />
    </div>
  );
}
