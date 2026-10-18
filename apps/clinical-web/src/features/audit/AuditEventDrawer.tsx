/**
 * Audit event drawer (CLN-10 task 4): every FRD §5 field — event id, actor, role, resource
 * (entity type + id), action, outcome / category, change summary as a two-column before → after
 * list, timestamp UTC (stored) + Africa/Kigali, facility, patient (synthetic id), correlation id,
 * justification. `access.*` (sensitive-read) events never show free text; change events do
 * (`review.dismissed` rationale is needed for accountability). Read-only: the only actions are
 * "View trail" and "Filter the table by this correlation".
 */
import { roleLabelKey } from "@laif/auth-demo";
import type { AuditEvent } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import { Button, Drawer, KeyValueList, useTx, type KeyValueItem } from "@laif/ui-web";
import { useState } from "react";

import { facilityLabel } from "../../app/persona-labels.ts";
import { personaName } from "../timeline/people.ts";
import { ActionPill } from "./AuditTable.tsx";
import { CorrelationTrail } from "./CorrelationTrail.tsx";
import { changeRows, visibleJustification } from "./model.ts";
import { DRAWER_FULL_SCREEN_CLASS } from "../../components/responsive.ts";

export type AuditEventDrawerProps = {
  event: AuditEvent | null;
  onClose: () => void;
  onFilterCorrelation: (correlationId: string) => void;
  syntheticIdOf: (patientId: string) => string | null;
};

export function AuditEventDrawer({
  event,
  onClose,
  onFilterCorrelation,
  syntheticIdOf,
}: AuditEventDrawerProps) {
  const t = useTx();
  return (
    <Drawer
      className={DRAWER_FULL_SCREEN_CLASS}
      open={event !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="lg"
      title={t("clinical:audit.drawer.title")}
      description={t("clinical:audit.drawer.description")}
    >
      {event === null ? null : (
        <AuditEventDetail
          key={event.id}
          event={event}
          onFilterCorrelation={onFilterCorrelation}
          syntheticIdOf={syntheticIdOf}
        />
      )}
    </Drawer>
  );
}

function AuditEventDetail({
  event,
  onFilterCorrelation,
  syntheticIdOf,
}: {
  event: AuditEvent;
  onFilterCorrelation: (correlationId: string) => void;
  syntheticIdOf: (patientId: string) => string | null;
}) {
  const t = useTx();
  const { language } = useLanguage();
  const [showTrail, setShowTrail] = useState(false);
  const none = t("clinical:audit.table.none");
  const justification = visibleJustification(event);
  const rows = changeRows(event.changeSummary);
  const patient =
    event.patientId === null
      ? none
      : `${syntheticIdOf(event.patientId) ?? ""} ${event.patientId}`.trim();

  const items: KeyValueItem[] = [
    { id: "eventId", label: t("clinical:audit.drawer.eventId"), value: <Mono>{event.id}</Mono> },
    { id: "action", label: t("clinical:audit.drawer.action"), value: <ActionPill event={event} /> },
    {
      id: "outcome",
      label: t("clinical:audit.drawer.outcome"),
      value: `${t(domainKey("auditOutcome", event.outcome))} · ${t(domainKey("auditCategory", event.category))}`,
    },
    {
      id: "actor",
      label: t("clinical:audit.drawer.actor"),
      value:
        event.actorId === null ? (
          t("clinical:audit.table.system")
        ) : (
          <span>
            {personaName(event.actorId)} <Mono>{event.actorId}</Mono>
          </span>
        ),
    },
    {
      id: "role",
      label: t("clinical:audit.drawer.role"),
      value: event.actorRole === null ? none : t(roleLabelKey(event.actorRole)),
    },
    {
      id: "resource",
      label: t("clinical:audit.drawer.resource"),
      value: (
        <span>
          {t(domainKey("entityType", event.entityType))} <Mono>{event.entityId}</Mono>
        </span>
      ),
    },
    {
      id: "utc",
      label: t("clinical:audit.drawer.timestampUtc"),
      value: <Mono>{event.occurredAt}</Mono>,
    },
    {
      id: "kigali",
      label: t("clinical:audit.drawer.timestampKigali"),
      value: formatDateTime(event.occurredAt, language, { style: "long" }),
    },
    {
      id: "facility",
      label: t("clinical:audit.drawer.facility"),
      value: event.facilityId === null ? none : facilityLabel(event.facilityId, t),
    },
    { id: "patient", label: t("clinical:audit.drawer.patient"), value: <Mono>{patient}</Mono> },
    {
      id: "correlation",
      label: t("clinical:audit.drawer.correlationId"),
      value: <Mono>{event.correlationId}</Mono>,
    },
    {
      id: "justification",
      label: t("clinical:audit.drawer.justification"),
      value:
        event.category === "access" ? (
          <span className="text-muted">{t("clinical:audit.drawer.justificationHidden")}</span>
        ) : justification === null || justification === "" ? (
          <span className="text-muted">{t("clinical:audit.drawer.noJustification")}</span>
        ) : (
          <span data-testid="audit-justification">{justification}</span>
        ),
    },
  ];

  return (
    <div className="space-y-6" data-testid="audit-event-drawer" data-event-id={event.id}>
      <KeyValueList items={items} />

      <section aria-labelledby="audit-change-title" className="space-y-2">
        <h3 id="audit-change-title" className="text-ink text-base font-semibold">
          {t("clinical:audit.drawer.change")}
        </h3>
        {rows.length === 0 ? (
          <p className="text-muted text-sm">{t("clinical:audit.drawer.noChange")}</p>
        ) : (
          <table className="w-full text-sm" data-testid="audit-change-table">
            <thead>
              <tr className="text-muted text-start">
                <th scope="col" className="py-1 pe-3 text-start font-medium">
                  {t("clinical:audit.drawer.field")}
                </th>
                <th scope="col" className="py-1 pe-3 text-start font-medium">
                  {t("clinical:audit.drawer.before")}
                </th>
                <th scope="col" className="py-1 text-start font-medium">
                  {t("clinical:audit.drawer.after")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-border-soft border-t align-top">
                  <th scope="row" className="py-1.5 pe-3 text-start font-mono text-xs">
                    {row.key}
                  </th>
                  <td className="py-1.5 pe-3 break-all">{row.before ?? none}</td>
                  <td className="py-1.5 break-all">{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {event.beforeHash !== undefined || event.afterHash !== undefined ? (
          <p className="text-muted text-xs">
            {t("clinical:audit.drawer.hashes")}: <Mono>{event.beforeHash ?? none}</Mono> →{" "}
            <Mono>{event.afterHash ?? none}</Mono>
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          icon="clock"
          aria-expanded={showTrail}
          data-testid="audit-view-trail"
          onClick={() => setShowTrail((open) => !open)}
        >
          {showTrail ? t("clinical:audit.drawer.hideTrail") : t("clinical:audit.drawer.viewTrail")}
        </Button>
        <Button variant="ghost" onClick={() => onFilterCorrelation(event.correlationId)}>
          {t("clinical:audit.drawer.filterByCorrelation")}
        </Button>
      </div>

      {showTrail ? <CorrelationTrail event={event} /> : null}
    </div>
  );
}

function Mono({ children }: { children: string }) {
  return <span className="font-mono text-xs break-all">{children}</span>;
}
