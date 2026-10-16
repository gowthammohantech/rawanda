import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";

/**
 * "DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE" (`demo:banner`).
 * Takes no props on purpose: it cannot be hidden, restyled away or reworded. Sticky at the top
 * of the viewport so it stays visible while the page scrolls (FND-11). `AppShell`
 * always renders it.
 */
export function DemoBanner() {
  const t = useTx();
  return (
    <aside
      aria-label={t("demo:notForClinicalUse")}
      data-testid="demo-banner"
      className="border-demo-banner-border bg-demo-banner-bg text-demo-banner-fg sticky top-0 z-40 flex min-h-7 items-center justify-center gap-2 border-b px-3 py-1 text-center text-[11px] font-semibold tracking-[0.04em]"
    >
      <Icon name="shield" size={15} className="shrink-0" />
      <p className="m-0">{t("demo:banner")}</p>
    </aside>
  );
}
