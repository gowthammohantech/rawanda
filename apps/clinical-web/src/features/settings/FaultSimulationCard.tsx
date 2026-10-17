/**
 * Settings › Fault simulation (CLN-02 task 6): Offline / Server 500 / Timeout after save /
 * Conflict on next write switches and a 0–3000 ms latency slider → `repository.demo.setFaults()`
 * (FND-07 `FaultConfig`, persisted in store meta; each change appends `demo.fault_toggled`).
 * Mapping in `src/data/faults.ts`. The latency is committed when the slider is released.
 */
import { Button, Card, Checkbox, StatusChip, useTx } from "@laif/ui-web";
import { useId, useState } from "react";

import { useDemoTools } from "../../app/demo-tools.tsx";
import {
  ALL_FAULTS_OFF,
  anyFaultActive,
  FAULT_SWITCHES,
  faultSwitchOn,
  faultSwitchPatch,
  LATENCY_MAX_MS,
  LATENCY_STEP_MS,
  latencyPatch,
  latencyValue,
} from "../../data/faults.ts";

export function FaultSimulationCard() {
  const t = useTx();
  const { faultConfig, applyFaults } = useDemoTools();
  const sliderId = useId();
  const committed = latencyValue(faultConfig);
  const [draft, setDraft] = useState<number | null>(null);
  const latency = draft ?? committed;
  const active = anyFaultActive(faultConfig);

  const commitLatency = () => {
    if (draft === null) return;
    const value = draft;
    setDraft(null);
    if (value !== committed) void applyFaults(latencyPatch(value));
  };

  return (
    <Card
      title={t("clinical:settings.faults.title")}
      meta={
        active ? (
          <StatusChip tone="warning">{t("clinical:settings.faults.activeBadge")}</StatusChip>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <p className="text-muted text-sm">{t("clinical:settings.faults.body")}</p>
        <div className="space-y-3">
          {FAULT_SWITCHES.map((key) => (
            <Checkbox
              key={key}
              role="switch"
              aria-checked={faultSwitchOn(faultConfig, key)}
              checked={faultSwitchOn(faultConfig, key)}
              onChange={(event) => void applyFaults(faultSwitchPatch(key, event.target.checked))}
              label={t(`clinical:settings.faults.${key}`)}
              description={t(`clinical:settings.faults.${key}Hint`)}
            />
          ))}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={sliderId} className="text-ink text-sm font-medium">
              {t("clinical:settings.faults.latency")}
            </label>
            <output htmlFor={sliderId} className="text-muted font-mono text-xs tabular-nums">
              {t("clinical:settings.faults.latencyValue", { ms: latency })}
            </output>
          </div>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={LATENCY_MAX_MS}
            step={LATENCY_STEP_MS}
            value={latency}
            aria-describedby={`${sliderId}-hint`}
            aria-valuetext={t("clinical:settings.faults.latencyValue", { ms: latency })}
            onChange={(event) => setDraft(Number(event.target.value))}
            onPointerUp={commitLatency}
            onKeyUp={commitLatency}
            onBlur={commitLatency}
            className="accent-primary target-min w-full"
          />
          <p id={`${sliderId}-hint`} className="text-muted text-xs">
            {t("clinical:settings.faults.latencyHint")}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!active}
          onClick={() => void applyFaults(ALL_FAULTS_OFF)}
        >
          {t("clinical:settings.faults.allOff")}
        </Button>
      </div>
    </Card>
  );
}
