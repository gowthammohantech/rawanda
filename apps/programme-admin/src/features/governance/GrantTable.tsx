/**
 * Roles & access tab (ADM-08 tasks 6–7; PA-08 "role configuration by authorised admin"): every
 * AccessGrant — persona, role, districts, facilities, valid until, version, last changed by.
 * Only `roles.configure` (programme lead) gets "Edit"; everyone else sees the table read-only
 * with a lock note. Each row expands to its version history (the `admin.access_grant.*` audit
 * events: before → after, justification); older versions are kept (T-06). After a save the row
 * is highlighted.
 */
import { checkAccess, isGrantExpired, roleLabelKey } from "@laif/auth-demo";
import { ALL_IN_DISTRICTS, type AccessGrant } from "@laif/contracts";
import { formatDateTime, useLanguage } from "@laif/i18n";
import {
  Button,
  Card,
  cx,
  EmptyState,
  ErrorState,
  errorCodeOf,
  ExpandableRow,
  Icon,
  LoadingSkeleton,
  StatusChip,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";
import { useState } from "react";
import { useLocation } from "react-router";

import { districtLabel, facilityLabel } from "../../app/persona-labels.ts";
import { useServices, useSessionStore, useAdminSession } from "../../app/providers.tsx";
import { findAdminPersona } from "../../auth/personas.ts";
import { grantChangeLines } from "./grantFormat.ts";
import { findDraft } from "../../lib/drafts.ts";
import { GrantEditDialog, type GrantFormValues } from "./GrantEditDialog.tsx";
import { useGrantHistory, useGrants } from "./queries.ts";

function GrantHistory({ grantId }: { grantId: string }) {
  const t = useTx();
  const { language } = useLanguage();
  const history = useGrantHistory(grantId, true);
  const date = (iso: string) => formatDateTime(iso, language);
  if (history.isPending) return <LoadingSkeleton lines={2} />;
  if (history.isError) {
    return (
      <ErrorState
        code={errorCodeOf(history.error) ?? "INTERNAL"}
        message={t("admin:governance.roles.historyError")}
        onRetry={() => history.refetch()}
      />
    );
  }
  if (history.data.length === 0) {
    return <p className="text-muted m-0 text-xs">{t("admin:governance.roles.historyEmpty")}</p>;
  }
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0" data-testid={`grant-history-${grantId}`}>
      {history.data.map((v) => (
        <li key={v.eventId} className="border-border-soft rounded-sm border px-3 py-2 text-xs">
          <p className="text-ink m-0 font-medium">
            {t("admin:governance.roles.historyEntry", {
              from: v.fromVersion ?? "?",
              to: v.toVersion ?? "?",
              actor: findAdminPersona(v.actorId)?.displayName ?? v.actorId ?? "—",
              time: date(v.at),
            })}
            {v.action === "admin.access_grant.revoked" ? (
              <span className="ms-2">
                <StatusChip tone="danger">{t("admin:governance.roles.revoked")}</StatusChip>
              </span>
            ) : null}
          </p>
          <ul className="m-0 mt-1 list-none p-0">
            {grantChangeLines(v.before, v.after, t, date).map((line) => (
              <li key={line.field}>
                {t(`admin:governance.grant.field.${line.field}` as TranslationKey)}: {line.from} →{" "}
                {line.to}
              </li>
            ))}
          </ul>
          {v.justification === null ? null : (
            <p className="text-muted m-0 mt-1">
              {t("admin:governance.roles.justification")}: {v.justification}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

export function GrantTable() {
  const t = useTx();
  const { language } = useLanguage();
  const { clock } = useServices();
  const store = useSessionStore();
  useAdminSession((s) => s.grant);
  const actor = store.actor();
  const canConfigure = actor !== null && checkAccess(actor, "roles.configure").allowed;
  const query = useGrants();
  // ADM-09 (T-09): a grant-edit draft left by an expired session reopens on this URL.
  const location = useLocation();
  const draftContext = `${location.pathname}${location.search}`;
  const [restore, setRestore] = useState(() => findDraft<GrantFormValues>("grant", draftContext));
  const [editingId, setEditingId] = useState<string | null>(restore?.subject ?? null);
  const editing = query.data?.find((g) => g.id === editingId) ?? null;
  const setEditing = (grant: AccessGrant | null) => {
    setEditingId(grant?.id ?? null);
    if (grant === null) setRestore(null);
  };
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const scope = (g: AccessGrant) =>
    [
      g.districtIds.map((id) => districtLabel(id, t)).join(", "),
      g.facilityIds === ALL_IN_DISTRICTS
        ? t("admin:governance.grant.allFacilities")
        : g.facilityIds.map((id) => facilityLabel(id, t)).join(", "),
    ].join(" · ");

  return (
    <div data-testid="grant-table" className="flex flex-col gap-4">
      {canConfigure ? null : (
        <p
          data-testid="roles-read-only"
          className="border-border-soft bg-background text-ink m-0 flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]"
        >
          <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
          <span>{t("admin:governance.roles.readOnly")}</span>
        </p>
      )}
      <Card title={t("admin:governance.roles.title")}>
        <p className="text-muted mt-0 mb-3 text-[13px]">{t("admin:governance.roles.subtitle")}</p>
        {query.isPending ? (
          <LoadingSkeleton variant="table" lines={4} />
        ) : query.isError ? (
          <ErrorState
            code={errorCodeOf(query.error) ?? "INTERNAL"}
            message={t("admin:governance.roles.error")}
            onRetry={() => query.refetch()}
          />
        ) : query.data.length === 0 ? (
          <EmptyState icon="people" title={t("admin:governance.roles.empty")} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {query.data.map((g) => {
              const persona = findAdminPersona(g.personaId);
              const expired = isGrantExpired(g, clock.nowIso());
              return (
                <li
                  key={g.id}
                  data-testid={`grant-row-${g.personaId}`}
                  data-highlighted={highlighted === g.id || undefined}
                  className={cx(
                    "rounded-md transition-colors",
                    highlighted === g.id && "bg-primary-soft",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <ExpandableRow
                      className="min-w-0 flex-1"
                      title={persona?.displayName ?? g.personaId}
                      subtitle={`${t(roleLabelKey(g.role))} · ${scope(g)}`}
                      trailing={
                        <span className="flex flex-wrap items-center gap-2">
                          {expired ? (
                            <StatusChip tone="danger">
                              {t("admin:governance.roles.revoked")}
                            </StatusChip>
                          ) : null}
                          <span className="text-muted font-mono text-xs">
                            {t("admin:governance.grant.versionShort", { version: g.version })}
                          </span>
                        </span>
                      }
                    >
                      <dl className="m-0 mb-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                        <div>
                          <dt className="text-muted">
                            {t("admin:governance.grant.field.validTo")}
                          </dt>
                          <dd className="text-ink m-0">
                            {g.validTo === undefined
                              ? t("admin:governance.grant.openEnded")
                              : formatDateTime(g.validTo, language)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">{t("admin:governance.roles.updatedBy")}</dt>
                          <dd className="text-ink m-0">
                            {findAdminPersona(g.updatedBy)?.displayName ?? g.updatedBy} ·{" "}
                            {formatDateTime(g.updatedAt, language)}
                          </dd>
                        </div>
                      </dl>
                      <h4 className="text-ink mt-0 mb-2 text-xs font-semibold">
                        {t("admin:governance.roles.history")}
                      </h4>
                      <GrantHistory grantId={g.id} />
                    </ExpandableRow>
                    {canConfigure ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={t("admin:governance.roles.editFor", {
                          persona: persona?.displayName ?? g.personaId,
                        })}
                        className="mt-2.5 shrink-0"
                        onClick={() => setEditing(g)}
                      >
                        {t("admin:governance.roles.edit")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {editing === null || query.data === undefined ? null : (
        <GrantEditDialog
          grant={editing}
          grants={query.data}
          onClose={() => setEditing(null)}
          onSaved={(saved) => setHighlighted(saved.id)}
          draftContext={draftContext}
          restore={restore?.subject === editing.id ? restore : null}
        />
      )}
    </div>
  );
}
