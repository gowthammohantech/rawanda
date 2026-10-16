import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";

export type OfflineBannerProps = {
  /** Already-formatted Kigali time of the last successful sync. */
  lastSyncedLabel?: string;
};

/** "You are offline. Changes are saved on this device." */
export function OfflineBanner({ lastSyncedLabel }: OfflineBannerProps) {
  const t = useTx();
  return (
    <div
      role="status"
      className="border-risk-warning/25 bg-risk-warning-soft text-risk-warning flex flex-wrap items-center gap-2 rounded-md border px-4 py-2 text-[13px]"
    >
      <Icon name="wifi-off" size={16} />
      <span className="font-semibold">{t("common:state.offline")}</span>
      {lastSyncedLabel === undefined ? null : (
        <span>{t("shell:offline.lastSynced", { time: lastSyncedLabel })}</span>
      )}
    </div>
  );
}
