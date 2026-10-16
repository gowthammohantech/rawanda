/**
 * Chrome of the demo sign-in (CLN-01): SkipLink, the always-on DemoBanner, brand + EN/RW
 * LanguageSwitcher, and a role note stating that no persona is selected and that role switching
 * is demo only — not authentication. Same rounded canvas as the signed-in shell.
 */
import { DemoBanner, Icon, LanguageSwitcher, RwandaMark, SkipLink, useTx } from "@laif/ui-web";
import type { ReactNode } from "react";

export function PublicShell({ children }: { children?: ReactNode }) {
  const t = useTx();
  return (
    <div className="bg-canvas lg:bg-border min-h-dvh">
      <SkipLink />
      <DemoBanner />
      <div
        data-testid="public-shell"
        className="bg-canvas lg:rounded-shell mx-auto flex max-w-[1100px] flex-col gap-4 p-3 sm:p-4 lg:my-4 lg:w-[calc(100%-32px)] lg:p-6"
      >
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <RwandaMark compact />
            <LanguageSwitcher />
          </div>
          <div
            role="note"
            className="border-border-soft bg-primary-soft text-ink flex items-center gap-2 rounded-md border px-4 py-2 text-[13px]"
          >
            <Icon name="user" size={16} className="text-primary-dark shrink-0" />
            <span>{t("clinical:login.noSessionNote")}</span>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 space-y-5 outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
