/**
 * Reset demo (ADM-09 task 4): a ConfirmDialog that requires typing `RESET` (the instruction is
 * translated; the literal token stays `RESET`). `repo.demo.resetDemo()` (admin slice = base seed +
 * overlay) clears every admin collection and restores the baseline dataset, the baseline audit
 * events (session events are discarded; `demo.reset` is the first post-baseline event), the
 * settings (k = 5), the demo clock and the fault defaults. Then the TanStack cache, drafts and the
 * session are cleared and the app returns to `/admin/login` ("Demo data restored").
 */
import { Button, Card, ConfirmDialog, TextInput, useTx } from "@laif/ui-web";
import { useState } from "react";
import { useNavigate } from "react-router";

import { useDemoTools } from "../../app/demo-tools.tsx";
import { paths } from "../../app/nav.ts";

export const RESET_TOKEN = "RESET" as const;

export function ResetDemoCard() {
  const t = useTx();
  const navigate = useNavigate();
  const { reset } = useDemoTools();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = typed.trim() === RESET_TOKEN;

  return (
    <Card as="section" title={t("admin:settings.reset.title")}>
      <div data-testid="reset-card" className="flex flex-col gap-3">
        <p className="text-muted m-0 text-[13px]">{t("admin:settings.reset.description")}</p>
        <div>
          <Button
            variant="danger"
            icon="refresh"
            className="h-auto max-w-full py-2 text-start whitespace-normal!"
            onClick={() => setOpen(true)}
          >
            {t("admin:settings.reset.open")}
          </Button>
        </div>
        <ConfirmDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setTyped("");
          }}
          variant="destructive"
          title={t("admin:settings.reset.dialogTitle")}
          description={t("admin:settings.reset.dialogDescription")}
          confirmLabel={t("admin:settings.reset.confirmButton")}
          confirmDisabled={!matches}
          loading={busy}
          onConfirm={async () => {
            if (!matches) return;
            setBusy(true);
            const ok = await reset();
            setBusy(false);
            if (ok) {
              setOpen(false);
              void navigate(paths.login, { replace: true });
            }
          }}
        >
          <TextInput
            label={t("admin:settings.reset.confirm")}
            hint={t("admin:settings.reset.confirmHint", { token: RESET_TOKEN })}
            value={typed}
            autoComplete="off"
            spellCheck={false}
            data-testid="reset-confirm-input"
            onChange={(event) => setTyped(event.currentTarget.value)}
          />
        </ConfirmDialog>
      </div>
    </Card>
  );
}
