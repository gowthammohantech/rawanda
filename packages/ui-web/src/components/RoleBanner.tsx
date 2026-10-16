import type { ReactNode } from "react";

import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";

export type RoleBannerProps = {
  /** Synthetic persona name (already resolved). */
  personaName: string;
  /** Translated role label, e.g. `t('domain:role.clinician')`. */
  roleLabel: string;
  /** Translated scope, e.g. "Demo Health Centre Alpha-1". */
  scopeLabel?: string;
  /** Optional trailing action (e.g. a PersonaSwitcher). */
  action?: ReactNode;
};

/** Persona + scope + "Demo role switch — not authentication". */
export function RoleBanner({ personaName, roleLabel, scopeLabel, action }: RoleBannerProps) {
  const t = useTx();
  return (
    <div
      role="note"
      className="border-border-soft bg-primary-soft text-ink flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-4 py-2 text-[13px]"
    >
      <Icon name="user" size={16} className="text-primary-dark" />
      <span className="font-semibold">{personaName}</span>
      <span className="text-muted">{roleLabel}</span>
      {scopeLabel === undefined ? null : (
        <span className="text-muted">{t("shell:role.scope", { scope: scopeLabel })}</span>
      )}
      <span className="micro-label text-primary-dark">{t("demo:demoRoleSwitcher")}</span>
      {action === undefined ? null : <span className="ms-auto">{action}</span>}
    </div>
  );
}
