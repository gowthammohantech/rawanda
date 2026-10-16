/**
 * Component gallery (FND-09): every @laif/ui-web component in one page, in EN and RW.
 * Also rendered by `src/components/a11y.axe.test.tsx` (axe on the whole page).
 */
import type { FlagResult } from "@laif/domain";
import { useLanguage } from "@laif/i18n";
import { useState, type ReactNode } from "react";

import {
  AccessibleDataTable,
  AppShell,
  AsyncBoundary,
  Avatar,
  BarList,
  BrandLoader,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  ConflictNotice,
  DateTimeInput,
  DemoToolsMenu,
  Drawer,
  EmptyState,
  ErrorState,
  ExpandableRow,
  ExplainableFlag,
  FilterBar,
  IconButton,
  InfoCallout,
  KeyValueList,
  KpiStrip,
  LoadingSkeleton,
  MetricCard,
  MicroLabel,
  NumberInput,
  OfflineBanner,
  PageHeader,
  Pagination,
  PermissionDenied,
  PersonaSwitcher,
  PrivacyNotice,
  ProgressBar,
  RadioCardGroup,
  ReadingDisplay,
  RoleBanner,
  RuleDisclaimer,
  RwandaMark,
  SegmentedProgress,
  Select,
  Sidebar,
  StatusChip,
  Stepper,
  SubNav,
  Tabs,
  Textarea,
  TextInput,
  Timeline,
  TrendChart,
  useToast,
  type DataTableColumn,
  type DemoFaultToggles,
  type FilterDefinition,
  type SidebarSection,
} from "../src/index.ts";
import { SAMPLE } from "./sample.ts";

const SECTIONS: SidebarSection[] = [
  {
    items: [
      { to: "#shell", labelKey: "shell:nav.section.overview", icon: "home" },
      {
        to: "#data",
        labelKey: "shell:nav.section.reports",
        icon: "trend",
        count: 8,
        countTone: "danger",
      },
    ],
  },
  {
    labelKey: "shell:nav.section.work",
    items: [
      { to: "#tables", labelKey: "shell:nav.section.patients", icon: "people", count: 24 },
      { to: "#forms", labelKey: "shell:nav.section.administration", icon: "clipboard" },
    ],
  },
  {
    labelKey: "shell:nav.section.settings",
    items: [{ to: "#feedback", labelKey: "shell:nav.section.settings", icon: "settings" }],
  },
];

const FLAG: FlagResult = {
  requiresReview: true,
  evaluable: true,
  reasonCodes: ["DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD", "DEMO_GLUCOSE_AT_OR_ABOVE_THRESHOLD"],
  triggeringObservations: [
    { code: "SYSTOLIC", value: 152, unit: "mmHg", comparedTo: 145 },
    { code: "GLUCOSE", value: 12.4, unit: "mmol/L", comparedTo: 11.5 },
  ],
  rulesetVersion: "demo-ruleset-2026.10-v1",
  displayDisclaimer: "DEMO_RULE_NOT_CLINICALLY_VALIDATED",
};

type PatientRow = {
  id: string;
  name: string;
  age: number;
  tone: "warning" | "positive" | "danger";
};
const ROWS: PatientRow[] = [
  { id: "CC-00472", name: "Uwase Clarisse", age: 54, tone: "warning" },
  { id: "CC-00468", name: "Habimana Noël", age: 61, tone: "danger" },
  { id: "CC-00455", name: "Mukamana Aline", age: 47, tone: "positive" },
];

type Filters = { status: "all" | "pending" | "done"; facility: string };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="space-y-4">
      <h2 id={`${id}-title`} className="font-display text-ink text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Gallery({ activePath = "#shell" }: { activePath?: string }) {
  const { language } = useLanguage();
  const s = SAMPLE[language];
  const { toast } = useToast();
  const [faults, setFaults] = useState<DemoFaultToggles>({
    offline: false,
    slow: false,
    errors: false,
  });
  const [persona, setPersona] = useState("p1");
  const [filters, setFilters] = useState<Filters>({ status: "all", facility: "" });
  const [page, setPage] = useState(1);
  const [decision, setDecision] = useState<"refer" | "dismiss" | null>("refer");
  const [due, setDue] = useState<string | null>("2026-10-20T07:00:00.000Z");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");

  const statusLabel: Record<PatientRow["tone"], string> = {
    warning: s.needsReview,
    danger: s.conflict,
    positive: s.approved,
  };
  const columns: DataTableColumn<PatientRow>[] = [
    { id: "id", header: s.colId, cell: (r) => <span className="font-mono text-xs">{r.id}</span> },
    {
      id: "name",
      header: s.colName,
      cell: (r) => r.name,
      sortValue: (r) => r.name,
      isRowHeader: true,
    },
    { id: "age", header: s.colAge, cell: (r) => r.age, sortValue: (r) => r.age, align: "end" },
    {
      id: "status",
      header: s.colStatus,
      cell: (r) => <StatusChip tone={r.tone}>{statusLabel[r.tone]}</StatusChip>,
    },
  ];
  const filterDefs: FilterDefinition<Filters>[] = [
    {
      id: "status",
      kind: "segmented",
      label: s.status,
      options: [
        { value: "all", label: s.all, count: 24 },
        { value: "pending", label: s.pendingF, count: 8 },
        { value: "done", label: s.done, count: 16 },
      ],
    },
    {
      id: "facility",
      kind: "select",
      label: s.facility,
      options: [
        { value: "", label: s.allFacilities },
        { value: "fac-alpha-1", label: "Alpha-1" },
        { value: "fac-beta-1", label: "Beta-1" },
      ],
    },
  ];

  return (
    <AppShell
      sidebar={
        <Sidebar
          sections={SECTIONS}
          activePath={activePath}
          footer={
            <Card variant="muted" className="space-y-1">
              <MicroLabel as="p">{s.role}</MicroLabel>
              <p className="text-ink text-[13px] font-medium">{s.scope}</p>
            </Card>
          }
        />
      }
      topbar={{
        search: { value: query, onValueChange: setQuery },
        notifications: {
          hasUnread: true,
          onClick: () => toast({ title: s.toastTitle, tone: "info" }),
        },
        persona: (
          <PersonaSwitcher
            value={persona}
            onChange={setPersona}
            personas={[
              { id: "p1", name: s.persona, roleLabel: s.role, scopeLabel: "Alpha-1" },
              { id: "p2", name: s.personaB, roleLabel: s.nurse, scopeLabel: "Alpha-2" },
            ]}
          />
        ),
        demoTools: (
          <DemoToolsMenu
            faults={faults}
            onFaultChange={(key, enabled) => setFaults((f) => ({ ...f, [key]: enabled }))}
            onReset={() => toast({ title: s.toastTitle })}
            scenarios={[{ id: "SCN-02", title: s.scenario }]}
            onLoadScenario={() => toast({ title: s.scenario, tone: "info" })}
          />
        ),
      }}
      banners={
        <>
          <RoleBanner personaName={s.persona} roleLabel={s.role} scopeLabel={s.scope} />
          {faults.offline ? <OfflineBanner lastSyncedLabel="08:00" /> : null}
        </>
      }
    >
      <PageHeader
        breadcrumbs={[{ label: s.crumbs[0] ?? "", to: "#shell" }, { label: s.crumbs[1] ?? "" }]}
        title={s.title}
        subtitle={s.subtitle}
        secondaryActions={
          <Button variant="secondary" icon="chevron-left">
            {s.back}
          </Button>
        }
        primaryAction={<Button icon="plus">{s.create}</Button>}
      />

      <Section id="shell" title={s.sectionShell}>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <div className="flex flex-wrap items-center gap-6">
              <RwandaMark />
              <RwandaMark compact />
            </div>
          </Card>
          <Card variant="flat" className="overflow-hidden">
            <BrandLoader layout="inline" />
          </Card>
        </div>
        <SubNav
          activePath="#data"
          items={[
            { to: "#shell", labelKey: "shell:nav.section.overview" },
            { to: "#data", labelKey: "shell:nav.section.reports", count: 24 },
            { to: "#forms", labelKey: "shell:nav.section.settings" },
          ]}
        />
        <OfflineBanner lastSyncedLabel="08:00" />
        <RuleDisclaimer />
        <InfoCallout title={s.calloutTitle}>{s.callout}</InfoCallout>
        <PrivacyNotice />
      </Section>

      <Section id="data" title={s.sectionData}>
        <KpiStrip
          label={s.sectionData}
          items={[
            { id: "p", label: s.pending, value: 18, hint: s.thisWeek },
            { id: "o", label: s.overdue, value: 4, tone: "danger", hint: s.needsYou },
            { id: "c", label: s.completed, value: "83%", tone: "positive" },
            { id: "b", label: s.beta, value: { value: null, suppressed: true } },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <StatusChip tone="neutral">{s.syncing}</StatusChip>
          <StatusChip tone="info">{s.needsReview}</StatusChip>
          <StatusChip tone="positive">{s.approved}</StatusChip>
          <StatusChip tone="warning">{s.needsYou}</StatusChip>
          <StatusChip tone="danger">{s.conflict}</StatusChip>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card eyebrow={s.objective} title={s.objectiveTitle} className="space-y-4 lg:col-span-2">
            <MetricCard variant="card" label={s.planDone} value={62} hint="5 / 8" />
            <SegmentedProgress label={s.planDone} total={8} completed={5} />
            <ProgressBar label={s.usage} value={72} valueText="72%" tone="info" />
            <BarList
              label={s.facilities}
              items={[
                { id: "a1", label: "Alpha-1", value: 96 },
                {
                  id: "a2",
                  label: "Alpha-2",
                  value: 71,
                  adornment: <StatusChip tone="warning">{s.needsYou}</StatusChip>,
                },
                { id: "b1", label: "Beta-1", value: { value: null, suppressed: true } },
              ]}
            />
          </Card>
          <Card title={s.account[0]?.[0] ?? ""}>
            <KeyValueList items={s.account.map(([label, value]) => ({ label, value }))} />
            <div className="mt-4 flex items-center gap-3">
              <Avatar name={s.persona} />
              <Avatar name={s.personaB} size="lg" />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <ReadingDisplay kind="bloodPressure" systolic={152} diastolic={96} />
              <ReadingDisplay kind="glucose" value={7.8} unit="mmol/L" context="non_fasting" />
              <ReadingDisplay kind="glucose" value={7.8} unit={null} />
            </div>
          </Card>
        </div>
        <Card>
          <TrendChart
            title={s.chartTitle}
            description={s.chartDesc}
            categories={["SEP 4", "SEP 11", "SEP 18", "SEP 25", "OCT 2"]}
            series={[
              { id: "screened", label: s.screened, values: [46, 51, 49, 54, 58], tone: "info" },
              {
                id: "flagged",
                label: s.flagged,
                values: [12, 14, 9, 11, 8],
                tone: "danger",
                dashed: true,
              },
            ]}
          />
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={s.activity}>
            <Timeline
              label={s.activity}
              items={[
                {
                  id: "1",
                  dateLabel: "OCT 2",
                  title: s.act1,
                  description: s.act1d,
                  chip: <StatusChip tone="warning">{s.needsYou}</StatusChip>,
                },
                { id: "2", dateLabel: "OCT 1", title: s.act2, description: s.act2d },
              ]}
            />
          </Card>
          <ExplainableFlag
            flag={FLAG}
            inputs={{
              systolic: 152,
              diastolic: 96,
              glucoseValue: 12.4,
              glucoseUnit: "mmol/L",
              glucoseContext: "non_fasting",
            }}
          />
        </div>
        <ExpandableRow
          title={s.rowTitle}
          subtitle={s.rowSub}
          tone="danger"
          leading={<Avatar name={s.persona} decorative />}
          trailing={<StatusChip tone="danger">{s.conflict}</StatusChip>}
          defaultExpanded
        >
          <p className="text-muted text-[13px]">{s.rowBody}</p>
        </ExpandableRow>
      </Section>

      <Section id="tables" title={s.sectionTables}>
        <FilterBar
          filters={filterDefs}
          value={filters}
          onChange={setFilters}
          resultCount={ROWS.length}
          onReset={() => setFilters({ status: "all", facility: "" })}
        />
        <Tabs
          label={s.tabs}
          tabs={[
            {
              value: "open",
              label: s.tabOpen,
              count: 3,
              content: (
                <AccessibleDataTable
                  caption={s.table}
                  columns={columns}
                  rows={ROWS}
                  getRowId={(r) => r.id}
                  totalCount={24}
                  rowAction={{
                    label: s.open,
                    accessibleLabel: (r) => `${s.open} ${r.name}`,
                    onAction: () => undefined,
                  }}
                  footer={<Pagination page={page} pageSize={3} total={24} onPageChange={setPage} />}
                />
              ),
            },
            {
              value: "overdue",
              label: s.tabOverdue,
              count: 4,
              content: <EmptyState onClearFilters={() => undefined} />,
            },
            {
              value: "done",
              label: s.tabDone,
              count: 16,
              content: <LoadingSkeleton variant="table" lines={3} />,
            },
          ]}
        />
      </Section>

      <Section id="forms" title={s.sectionForms}>
        <Card className="grid gap-4 md:grid-cols-2">
          <TextInput
            label={s.reason}
            hint={s.reasonHint}
            required
            error={'validation:reasonTooShort|{"min":10}'}
          />
          <NumberInput label={s.systolic} unit="mmHg" defaultValue="152" />
          <Select
            label={s.unit}
            options={[
              { value: "mmol/L", label: "mmol/L" },
              { value: "mg/dL", label: "mg/dL" },
            ]}
            defaultValue="mmol/L"
          />
          <DateTimeInput label={s.due} value={due} onChange={setDue} />
          <Textarea
            label={s.note}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fieldClassName="md:col-span-2"
          />
          <RadioCardGroup
            legend={s.decision}
            value={decision}
            onChange={setDecision}
            className="md:col-span-2"
            options={[
              { value: "refer", label: s.refer, description: s.referDesc, icon: "arrow" },
              { value: "dismiss", label: s.dismiss, description: s.dismissDesc, icon: "close" },
            ]}
          />
          <Checkbox label={s.confirmCheck} description={s.confirmCheckDesc} />
        </Card>
        <Stepper steps={s.steps.map((label, i) => ({ id: String(i), label }))} currentIndex={1} />
        <Stepper
          steps={[
            { id: "a", label: s.steps[0] ?? "" },
            { id: "b", label: s.steps[1] ?? "", status: "cancelled" },
          ]}
          currentIndex={1}
          terminal={<StatusChip tone="danger">{s.cancelled}</StatusChip>}
        />
      </Section>

      <Section id="feedback" title={s.sectionFeedback}>
        <div className="flex flex-wrap gap-2">
          <ConfirmDialog
            trigger={<Button variant="danger">{s.openDialog}</Button>}
            title={s.dialogTitle}
            description={s.dialogDesc}
            variant="destructive"
            requireReason
            onConfirm={() => toast({ title: s.toastTitle })}
          />
          <Drawer
            trigger={<Button variant="secondary">{s.openDrawer}</Button>}
            title={s.drawerTitle}
            footer={<Button>{s.create}</Button>}
          >
            <Stepper
              steps={s.steps.map((label, i) => ({ id: String(i), label }))}
              currentIndex={2}
              orientation="vertical"
            />
          </Drawer>
          <Button
            variant="ghost"
            onClick={() => toast({ title: s.toastTitle, description: s.act1d })}
          >
            {s.toast}
          </Button>
          <Button loading>{s.create}</Button>
          <IconButton icon="refresh" labelKey="common:actions.retry" variant="outline" />
        </div>
        <ConflictNotice
          rows={[
            { id: "status", label: s.fieldStatus, yours: s.scheduled, latest: s.cancelled },
            { id: "owner", label: s.fieldOwner, yours: s.persona, latest: s.persona },
          ]}
          changedBy={s.personaB}
          changedAt="2026-10-14T06:00:00.000Z"
          onResolve={() => toast({ title: s.toastTitle })}
        />
        <div className="grid gap-4 md:grid-cols-3">
          <EmptyState />
          <ErrorState code="DEPENDENCY_UNAVAILABLE" onRetry={() => undefined} />
          <PermissionDenied />
        </div>
        <LoadingSkeleton variant="kpi" />
        <AsyncBoundary status="success" offline hasCachedData lastUpdatedLabel="08:00">
          <MetricCard label={s.pending} value={18} />
        </AsyncBoundary>
      </Section>
    </AppShell>
  );
}
