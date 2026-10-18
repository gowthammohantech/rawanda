/**
 * Session card (ADM-09 task 5, FRD T-09): the demo persona, role, reporting scope and grant
 * version, plus "Expire session now" — records `session.expired`, then marks the session expired.
 * The next navigation or failing query / mutation redirects to
 * `/admin/login?next=<path+search>&expired=1` ("Your demo session expired"); after signing in
 * again the user lands on the same filtered view, and open dialogs restore their drafts.
 * DEMO ROLE SWITCH — NOT AUTHENTICATION.
 */
import { formatDateTime, useLanguage } from "@laif/i18n";
import { Button, Card, KeyValueList, StatusChip, useToast, useTx } from "@laif/ui-web";
import { useState } from "react";

import { grantScopeSummary, personaOption } from "../../app/persona-labels.ts";
import { useAdminSession, useServices } from "../../app/providers.tsx";
import { expireAdminSession } from "../../auth/signIn.ts";

export function SessionCard() {
  const t = useTx();
  const { language } = useLanguage();
  const { toast } = useToast();
  const services = useServices();
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  const session = useAdminSession((s) => s.session);
  const [busy, setBusy] = useState(false);
  if (persona === null || session === null) return null;
  const expired = session.expired === true;

  return (
    <Card as="section" title={t("admin:settings.session.title")}>
      <div data-testid="session-card" className="flex flex-col gap-3">
        <StatusChip tone="warning" className="self-start">
          {t("admin:settings.session.demoTag")}
        </StatusChip>
        <KeyValueList
          items={[
            { label: t("admin:settings.session.persona"), value: persona.displayName },
            { label: t("admin:settings.session.role"), value: personaOption(persona, t).roleLabel },
            {
              label: t("admin:settings.session.grant"),
              value: t("admin:settings.session.grantValue", {
                scope: grantScopeSummary(persona, grant, t),
                version: grant?.version ?? "—",
              }),
            },
            {
              label: t("admin:settings.session.started"),
              value: formatDateTime(session.startedAt, language),
            },
          ]}
        />
        <p className="text-muted m-0 text-xs">{t("admin:settings.session.expireHint")}</p>
        {expired ? (
          <p
            role="status"
            data-testid="session-expired-status"
            className="text-ink m-0 text-[13px] font-medium"
          >
            {t("admin:settings.session.expiredStatus")}
          </p>
        ) : (
          <div>
            <Button
              variant="secondary"
              icon="clock"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await expireAdminSession(services);
                  toast({ title: t("admin:settings.session.expiredToast") });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("admin:settings.session.expire")}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
