/**
 * Demo transport fault simulation (ADM-09 task 3) — FND-07 `FaultConfig` via `repo.demo.setFaults`:
 * latency → `latencyMs` (slow network 1.5–3 s), server error → `serverErrorRate`, timeout
 * (response lost after the write committed) → `timeoutRate`, offline → `offline`, conflict on the
 * next settings write → `conflictOnce` (`audit_event` / `admin-settings`). Rates: off / sometimes
 * (25 %) / always (100 %). Any active fault shows the FAULT SIMULATION ON pill in the topbar;
 * Reset demo clears them all. Demo tooling, not a governance record (the repository logs each
 * toggle as a `demo.*` event, outside the business audit trail).
 */
import { ADMIN_SETTINGS_ID } from "@laif/contracts";
import { SLOW_NETWORK_LATENCY_MS, DEFAULT_FAULT_CONFIG } from "@laif/repositories";
import { Button, Card, Checkbox, Select, StatusChip, useTx } from "@laif/ui-web";

import { useDemoTools } from "../../app/demo-tools.tsx";

export const CONFLICT_TARGET = { entityType: "audit_event", entityId: ADMIN_SETTINGS_ID } as const;

const RATES = { off: 0, sometimes: 0.25, always: 1 } as const;
type RateLevel = keyof typeof RATES;

export function rateLevel(rate: number): RateLevel {
  if (rate <= 0) return "off";
  return rate >= 1 ? "always" : "sometimes";
}

export function FaultSimulationPanel() {
  const t = useTx();
  const { config, faultActive, applyFaults } = useDemoTools();
  const slow = config.latencyMs[0] >= SLOW_NETWORK_LATENCY_MS[0];
  const conflictArmed = config.conflictOnce.some(
    (c) => c.entityType === CONFLICT_TARGET.entityType && c.entityId === CONFLICT_TARGET.entityId,
  );
  const rateOptions = (["off", "sometimes", "always"] as const).map((level) => ({
    value: level,
    label: t(`admin:settings.faults.rate.${level}`),
  }));

  return (
    <Card
      as="section"
      title={t("admin:settings.faults.title")}
      meta={
        faultActive ? (
          <StatusChip tone="danger" icon="alert">
            {t("admin:settings.faults.pill")}
          </StatusChip>
        ) : (
          <StatusChip tone="neutral">{t("admin:settings.faults.none")}</StatusChip>
        )
      }
    >
      <div id="faults" data-testid="fault-panel" className="flex scroll-mt-24 flex-col gap-4">
        <p className="text-muted m-0 text-[13px]">{t("admin:settings.faults.description")}</p>
        <Checkbox
          label={t("admin:settings.faults.latency")}
          description={t("admin:settings.faults.latencyHint")}
          checked={slow}
          onChange={(event) =>
            void applyFaults({
              latencyMs: event.currentTarget.checked
                ? [SLOW_NETWORK_LATENCY_MS[0], SLOW_NETWORK_LATENCY_MS[1]]
                : [DEFAULT_FAULT_CONFIG.latencyMs[0], DEFAULT_FAULT_CONFIG.latencyMs[1]],
            })
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t("admin:settings.faults.serverError")}
            hint={t("admin:settings.faults.serverErrorHint")}
            options={rateOptions}
            value={rateLevel(config.serverErrorRate)}
            onChange={(event) =>
              void applyFaults({ serverErrorRate: RATES[event.currentTarget.value as RateLevel] })
            }
          />
          <Select
            label={t("admin:settings.faults.timeout")}
            hint={t("admin:settings.faults.timeoutHint")}
            options={rateOptions}
            value={rateLevel(config.timeoutRate)}
            onChange={(event) =>
              void applyFaults({ timeoutRate: RATES[event.currentTarget.value as RateLevel] })
            }
          />
        </div>
        <Checkbox
          label={t("admin:settings.faults.offline")}
          description={t("admin:settings.faults.offlineHint")}
          checked={config.offline}
          onChange={(event) => void applyFaults({ offline: event.currentTarget.checked })}
        />
        <Checkbox
          label={t("admin:settings.faults.conflict")}
          description={t("admin:settings.faults.conflictHint")}
          checked={conflictArmed}
          onChange={(event) =>
            void applyFaults({
              conflictOnce: event.currentTarget.checked
                ? [...config.conflictOnce, CONFLICT_TARGET]
                : config.conflictOnce.filter(
                    (c) =>
                      !(
                        c.entityType === CONFLICT_TARGET.entityType &&
                        c.entityId === CONFLICT_TARGET.entityId
                      ),
                  ),
            })
          }
        />
        <div>
          <Button
            variant="secondary"
            icon="refresh"
            disabled={!faultActive}
            onClick={() =>
              void applyFaults({
                latencyMs: [DEFAULT_FAULT_CONFIG.latencyMs[0], DEFAULT_FAULT_CONFIG.latencyMs[1]],
                serverErrorRate: 0,
                timeoutRate: 0,
                dependencyUnavailableRate: 0,
                offline: false,
                conflictOnce: [],
                deviceRevoked: false,
              })
            }
          >
            {t("admin:settings.faults.clear")}
          </Button>
        </div>
        <p className="text-muted m-0 text-xs">{t("admin:settings.faults.footnote")}</p>
      </div>
    </Card>
  );
}
