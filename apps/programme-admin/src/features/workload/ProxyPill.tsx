/** Mono `PROXY` pill (ADM-05): every workload time figure is a proxy measure, never a rating. */
import { cx, useTx } from "@laif/ui-web";

export function ProxyPill({ className }: { className?: string }) {
  const t = useTx();
  return (
    <span
      data-testid="proxy-pill"
      title={t("admin:workload.proxyTitle")}
      className={cx(
        "border-border bg-background text-muted rounded-sm border px-1 py-px font-mono text-[10px] font-medium tracking-wide",
        className,
      )}
    >
      {t("admin:workload.proxy")}
    </span>
  );
}
