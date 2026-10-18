/**
 * Settings → Network simulation (HWM-02 task 5). Always labelled `SIMULATION` / "Simulated sync
 * server (on this device)". Every control maps onto the FND-07 `FaultConfig` (persisted in store
 * meta `demo.faults`, audited `demo.fault_toggled` — the phase's `settings.network_sim_changed`):
 *
 * | Control                                   | FaultConfig / API                                  |
 * |-------------------------------------------|----------------------------------------------------|
 * | Work offline (simulated)                  | `offline`                                          |
 * | Response delay (preset steps)             | `latencyMs` (clamped by `normaliseFaultConfig`)    |
 * | Failure type + rate: server error         | `serverErrorRate`                                  |
 * | Failure type + rate: unavailable          | `dependencyUnavailableRate`                        |
 * | Failure type + rate: lost reply (timeout) | `timeoutRate` (dropped acknowledgement, after commit) |
 * | Simulate a clinician update               | `repo.sync.simulateRemoteEdit('followUp', id, …)`  |
 * | Make the next sync conflict               | `conflictOnce` (follow-up)                         |
 *
 * The HWM-02 "Run one sync pass" dev button moved to the Sync center (HWM-09 "Sync now"); going
 * back online here triggers a sync by itself (HWM-09 `online` trigger).
 * The kit has no slider (and RN core none), so delay and rate use preset segmented steps.
 */
import { formatDateTime, useLanguage } from "@laif/i18n";
import type { FollowUp, Patient } from "@laif/domain";
import type { FaultConfig, FaultConfigPatch } from "@laif/repositories";
import {
  Button,
  InfoCallout,
  KeyValueList,
  Screen,
  Section,
  SegmentedControl,
  SelectSheet,
  StatusChip,
  Toggle,
  useToast,
  useTx,
} from "@laif/ui-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { useSyncStatus } from "../../data/hooks/useSyncStatus.ts";
import { invalidateAfterWrite } from "../../data/queryKeys.ts";
import { useNetwork } from "../../network/NetworkProvider.tsx";
import { useRepository } from "../../providers.tsx";

export const LATENCY_PRESETS = {
  none: [0, 0],
  normal: [150, 450],
  slow: [1500, 3000],
  verySlow: [4000, 8000],
} as const satisfies Record<string, readonly [number, number]>;
export type LatencyPreset = keyof typeof LATENCY_PRESETS;

export const FAILURE_RATES = { off: 0, r25: 0.25, r50: 0.5, r100: 1 } as const;
export type FailureRatePreset = keyof typeof FAILURE_RATES;

export const FAILURE_MODES = {
  server_error: "serverErrorRate",
  unavailable: "dependencyUnavailableRate",
  dropped_ack: "timeoutRate",
} as const satisfies Record<string, keyof FaultConfig>;
export type FailureMode = keyof typeof FAILURE_MODES;

const DAY_MS = 86_400_000;

export function latencyPresetOf(config: Pick<FaultConfig, "latencyMs">): LatencyPreset | null {
  const [min, max] = config.latencyMs;
  const match = (Object.keys(LATENCY_PRESETS) as LatencyPreset[]).find(
    (key) => LATENCY_PRESETS[key][0] === min && LATENCY_PRESETS[key][1] === max,
  );
  return match ?? null;
}

/** The active failure mode (first non-zero rate) and its rate. */
export function failureOf(config: FaultConfig): { mode: FailureMode | null; rate: number } {
  const mode = (Object.keys(FAILURE_MODES) as FailureMode[]).find(
    (key) => config[FAILURE_MODES[key]] > 0,
  );
  return mode === undefined ? { mode: null, rate: 0 } : { mode, rate: config[FAILURE_MODES[mode]] };
}

/** One failure mode at a time: the chosen field gets `rate`, the other two 0. */
export function failurePatch(mode: FailureMode, rate: number): FaultConfigPatch {
  return {
    serverErrorRate: mode === "server_error" ? rate : 0,
    dependencyUnavailableRate: mode === "unavailable" ? rate : 0,
    timeoutRate: mode === "dropped_ack" ? rate : 0,
  };
}

function ratePresetOf(rate: number): FailureRatePreset | null {
  const match = (Object.keys(FAILURE_RATES) as FailureRatePreset[]).find(
    (key) => FAILURE_RATES[key] === rate,
  );
  return match ?? null;
}

export type NetworkSimulationScreenProps = { onBack?: () => void };

export function NetworkSimulationScreen({ onBack }: NetworkSimulationScreenProps) {
  const t = useTx();
  const { language } = useLanguage();
  const { toast } = useToast();
  const repo = useRepository();
  const queryClient = useQueryClient();
  const { config, setFaults } = useNetwork();
  const status = useSyncStatus();
  const failure = failureOf(config);
  const [modeChoice, setModeChoice] = useState<FailureMode>(failure.mode ?? "server_error");
  const mode = failure.mode ?? modeChoice;
  const [followUpId, setFollowUpId] = useState<string | null>(null);

  const followUps = useQuery({
    queryKey: ["home", "netsim", "followUps"],
    queryFn: async () => {
      const [list, patients] = await Promise.all([
        repo.listFollowUps({ pageSize: 100 }),
        repo.listPatients({ pageSize: 100 }),
      ]);
      const names = new Map(patients.items.map((p: Patient) => [p.id, p.displayName]));
      return list.items.map((f: FollowUp) => ({ followUp: f, patient: names.get(f.patientId) }));
    },
  });

  const failed = () => toast({ title: t("demo:tools.actionFailed"), tone: "danger" });

  const apply = async (patch: FaultConfigPatch) => {
    try {
      await setFaults(patch);
      await invalidateAfterWrite(queryClient);
      toast({ title: t("worker:netsim.updated") });
    } catch {
      failed();
    }
  };

  const selected = followUps.data?.find((row) => row.followUp.id === followUpId)?.followUp ?? null;

  const simulateClinicianUpdate = async () => {
    if (selected === null) return;
    try {
      // "A clinician moved the due date by one day" on the sync server: version bump, so the
      // worker's next queued change to this follow-up meets a CONFLICT (WF-02.3).
      await repo.sync.simulateRemoteEdit("followUp", selected.id, {
        dueAt: new Date(Date.parse(selected.dueAt) + DAY_MS).toISOString(),
      });
      await invalidateAfterWrite(queryClient);
      toast({ title: t("worker:netsim.clinicianUpdateDone") });
    } catch {
      failed();
    }
  };

  const armConflict = async () => {
    if (selected === null) return;
    try {
      await setFaults({
        conflictOnce: [...config.conflictOnce, { entityType: "follow_up", entityId: selected.id }],
      });
      toast({ title: t("worker:netsim.conflictArmed") });
    } catch {
      failed();
    }
  };

  const latency = latencyPresetOf(config);
  const rate = ratePresetOf(failure.rate);

  return (
    <Screen
      testID="network-simulation-screen"
      offline={config.offline}
      header={
        <AppHeader
          title={t("worker:netsim.title")}
          showAvatar={false}
          {...(onBack === undefined ? {} : { onBack })}
        />
      }
    >
      <View style={styles.pillRow}>
        <StatusChip tone="warning" icon="info" testID="simulation-pill">
          {t("worker:netsim.pill")}
        </StatusChip>
      </View>
      <InfoCallout icon="info" title={t("worker:netsim.server")}>
        {t("worker:netsim.notice")}
      </InfoCallout>

      <Section title={t("worker:netsim.title")}>
        <Toggle
          testID="netsim-offline"
          label={t("worker:netsim.offline")}
          description={t("worker:netsim.offlineHint")}
          value={config.offline}
          onValueChange={(value) => void apply({ offline: value })}
        />
        <SegmentedControl<LatencyPreset>
          testID="netsim-latency"
          label={t("worker:netsim.latency")}
          value={latency}
          onChange={(value) =>
            void apply({ latencyMs: [LATENCY_PRESETS[value][0], LATENCY_PRESETS[value][1]] })
          }
          options={[
            { value: "none", label: t("worker:netsim.latencyNone") },
            { value: "normal", label: t("worker:netsim.latencyNormal") },
            { value: "slow", label: t("worker:netsim.latencySlow") },
            { value: "verySlow", label: t("worker:netsim.latencyVerySlow") },
          ]}
        />
        <InfoCallout icon="clock">
          {t("worker:netsim.latencyHint", { min: config.latencyMs[0], max: config.latencyMs[1] })}
        </InfoCallout>
      </Section>

      <Section title={t("worker:netsim.failures")}>
        <SegmentedControl<FailureMode>
          testID="netsim-failure-mode"
          label={t("worker:netsim.failureMode")}
          value={mode}
          onChange={(value) => {
            setModeChoice(value);
            if (failure.rate > 0) void apply(failurePatch(value, failure.rate));
          }}
          options={[
            { value: "server_error", label: t("worker:netsim.modeServerError") },
            { value: "unavailable", label: t("worker:netsim.modeUnavailable") },
            { value: "dropped_ack", label: t("worker:netsim.modeDroppedAck") },
          ]}
        />
        <SegmentedControl<FailureRatePreset>
          testID="netsim-failure-rate"
          label={t("worker:netsim.failureRate")}
          value={rate}
          onChange={(value) => void apply(failurePatch(mode, FAILURE_RATES[value]))}
          options={[
            { value: "off", label: t("worker:netsim.rateOff") },
            { value: "r25", label: t("worker:netsim.rate25") },
            { value: "r50", label: t("worker:netsim.rate50") },
            { value: "r100", label: t("worker:netsim.rate100") },
          ]}
        />
        <InfoCallout icon="info">{t("worker:netsim.modeHint")}</InfoCallout>
      </Section>

      <Section title={t("worker:netsim.remote")}>
        {followUps.data !== undefined && followUps.data.length === 0 ? (
          <InfoCallout icon="info">{t("worker:netsim.noFollowUps")}</InfoCallout>
        ) : (
          <SelectSheet
            testID="netsim-follow-up"
            label={t("worker:netsim.followUp")}
            value={followUpId}
            onChange={setFollowUpId}
            options={(followUps.data ?? []).map(({ followUp, patient }) => ({
              value: followUp.id,
              label: t("worker:netsim.followUpOption", {
                patient: patient ?? followUp.patientId,
                due: formatDateTime(followUp.dueAt, language),
              }),
            }))}
          />
        )}
        <Button
          testID="netsim-clinician-update"
          variant="secondary"
          icon="calendar"
          disabled={selected === null}
          onPress={() => void simulateClinicianUpdate()}
        >
          {t("worker:netsim.clinicianUpdate")}
        </Button>
        <Button
          testID="netsim-conflict-next"
          variant="secondary"
          icon="alert"
          disabled={selected === null}
          onPress={() => void armConflict()}
        >
          {t("worker:netsim.conflictNext")}
        </Button>
        {config.conflictOnce.length > 0 ? (
          <StatusChip tone="warning" testID="netsim-conflicts-armed">
            {t("worker:netsim.conflictPending", { count: config.conflictOnce.length })}
          </StatusChip>
        ) : null}
      </Section>

      <Section title={t("worker:netsim.status")}>
        <KeyValueList
          testID="netsim-status"
          items={[
            { id: "pending", label: t("worker:netsim.pending"), value: String(status.pending) },
            {
              id: "conflicts",
              label: t("worker:netsim.needsDecision"),
              value: String(status.conflicts),
            },
            {
              id: "lastSynced",
              label: t("worker:netsim.lastSynced"),
              value:
                status.lastSyncedAt === null
                  ? t("worker:netsim.never")
                  : formatDateTime(status.lastSyncedAt, language),
            },
          ]}
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: "row" },
});
