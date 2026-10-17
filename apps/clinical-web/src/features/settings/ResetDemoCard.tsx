/**
 * Settings › Reset demo (CLN-02 task 6): ConfirmDialog → `repository.demo.resetDemo()` (one
 * transaction: a failure leaves the DB untouched) → query cache cleared → session signed out if
 * no longer valid → toast. The repository appends `demo.reset` (with the actor) as the first
 * event of the fresh audit log.
 */
import { Button, Card, ConfirmDialog, useToast, useTx } from "@laif/ui-web";
import { useState } from "react";

import { useDemoTools } from "../../app/demo-tools.tsx";
import { QueryErrorState } from "../../components/QueryErrorState.tsx";

export function ResetDemoCard() {
  const t = useTx();
  const { toast } = useToast();
  const { reset } = useDemoTools();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async () => {
    setBusy(true);
    try {
      await reset({ rethrow: true, silent: true });
      setError(null);
      setOpen(false);
      toast({ title: t("clinical:settings.reset.success"), tone: "positive" });
    } catch (failure) {
      setError(failure);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t("clinical:settings.reset.title")}>
      <div className="space-y-4">
        <p className="text-muted text-sm">{t("clinical:settings.reset.body")}</p>
        {error === null ? null : (
          <QueryErrorState
            error={error}
            onRetry={run}
            action={
              <span className="text-muted text-xs">{t("clinical:settings.reset.failedBody")}</span>
            }
          />
        )}
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          variant="destructive"
          loading={busy}
          trigger={
            <Button variant="danger" icon="refresh">
              {t("clinical:settings.reset.open")}
            </Button>
          }
          title={t("clinical:settings.reset.confirmTitle")}
          description={t("clinical:settings.reset.body")}
          confirmLabel={t("clinical:settings.reset.confirm")}
          onConfirm={run}
        />
      </div>
    </Card>
  );
}
