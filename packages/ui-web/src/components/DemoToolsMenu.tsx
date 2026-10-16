import * as Menu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";

import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

/** Toggles mapped by apps onto FND-07 `FaultConfig` (offline / latency / server errors). */
export type DemoFaultToggles = { offline: boolean; slow: boolean; errors: boolean };
export type DemoFaultKey = keyof DemoFaultToggles;

export type DemoScenarioOption = { id: string; /** Translated title. */ title: string };

export type DemoToolsMenuProps = {
  /** Called after the user confirms "Reset demo" in the ConfirmDialog. May return a promise. */
  onReset: () => unknown;
  faults: DemoFaultToggles;
  onFaultChange: (key: DemoFaultKey, enabled: boolean) => void;
  /** Scenarios for this app (`SCENARIOS` filtered by app); omitted = no scenario loader. */
  scenarios?: readonly DemoScenarioOption[];
  onLoadScenario?: (scenarioId: string) => void;
  /** Extra items (REL-01: "Export scenario…" / "Import scenario…"). */
  extraItems?: readonly { id: string; label: string; onSelect: () => void }[];
};

const FAULTS: readonly {
  key: DemoFaultKey;
  labelKey: "demo:tools.offline" | "demo:tools.slowNetwork" | "demo:tools.serverErrors";
}[] = [
  { key: "offline", labelKey: "demo:tools.offline" },
  { key: "slow", labelKey: "demo:tools.slowNetwork" },
  { key: "errors", labelKey: "demo:tools.serverErrors" },
];

const ITEM =
  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-[13px] text-ink outline-none data-[highlighted]:bg-background";

/** Demo tools: Reset demo (confirmed), fault toggles, scenario loader. Handlers come from apps. */
export function DemoToolsMenu({
  onReset,
  faults,
  onFaultChange,
  scenarios = [],
  onLoadScenario,
  extraItems = [],
}: DemoToolsMenuProps) {
  const t = useTx();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const anyFault = faults.offline || faults.slow || faults.errors;

  const confirmReset = async () => {
    setResetting(true);
    try {
      await onReset();
      setConfirmOpen(false);
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          aria-label={t("demo:tools.label")}
          className="target-min rounded-pill border-demo-banner-border bg-demo-banner-bg text-demo-banner-fg relative inline-flex items-center gap-1.5 border px-3 text-[13px] font-medium"
        >
          <Icon name="settings" size={16} />
          <span className="hidden sm:inline">{t("demo:tools.label")}</span>
          {anyFault ? <span aria-hidden="true" className="rounded-pill bg-danger size-2" /> : null}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={8}
            className="border-border-soft bg-surface shadow-overlay z-50 w-64 rounded-md border p-1"
          >
            <Menu.Label className="micro-label text-muted px-2 pt-2 pb-1">
              {t("demo:tools.label")}
            </Menu.Label>
            <Menu.Item className={ITEM} onSelect={() => setConfirmOpen(true)}>
              <Icon name="refresh" size={16} />
              {t("demo:tools.reset")}
            </Menu.Item>
            <Menu.Separator className="bg-border-soft my-1 h-px" />
            <Menu.Label className="micro-label text-muted px-2 pt-1 pb-1">
              {t("demo:tools.faults")}
            </Menu.Label>
            {FAULTS.map((fault) => (
              <Menu.CheckboxItem
                key={fault.key}
                checked={faults[fault.key]}
                onCheckedChange={(checked) => onFaultChange(fault.key, checked)}
                onSelect={(event) => event.preventDefault()}
                className={ITEM}
              >
                <span className="border-border inline-flex size-4 items-center justify-center rounded-sm border">
                  <Menu.ItemIndicator>
                    <Icon name="check" size={12} strokeWidth={2.6} />
                  </Menu.ItemIndicator>
                </span>
                {t(fault.labelKey)}
              </Menu.CheckboxItem>
            ))}
            {scenarios.length === 0 || onLoadScenario === undefined ? null : (
              <>
                <Menu.Separator className="bg-border-soft my-1 h-px" />
                <Menu.Sub>
                  <Menu.SubTrigger className={ITEM}>
                    <Icon name="clipboard" size={16} />
                    <span className="flex-1">{t("demo:tools.loadScenario")}</span>
                    <Icon name="chevron" size={14} />
                  </Menu.SubTrigger>
                  <Menu.Portal>
                    <Menu.SubContent className="border-border-soft bg-surface shadow-overlay z-50 max-h-80 w-72 overflow-y-auto rounded-md border p-1">
                      {scenarios.map((scenario) => (
                        <Menu.Item
                          key={scenario.id}
                          className={ITEM}
                          onSelect={() => onLoadScenario(scenario.id)}
                        >
                          <span className="text-muted font-mono text-[11px]">{scenario.id}</span>
                          <span className="min-w-0 truncate">{scenario.title}</span>
                        </Menu.Item>
                      ))}
                    </Menu.SubContent>
                  </Menu.Portal>
                </Menu.Sub>
              </>
            )}
            {extraItems.length === 0 ? null : (
              <>
                <Menu.Separator className="bg-border-soft my-1 h-px" />
                {extraItems.map((item) => (
                  <Menu.Item key={item.id} className={ITEM} onSelect={item.onSelect}>
                    {item.label}
                  </Menu.Item>
                ))}
              </>
            )}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant="destructive"
        title={t("demo:tools.resetTitle")}
        description={t("demo:resetConfirm")}
        confirmLabel={t("demo:tools.reset")}
        loading={resetting}
        onConfirm={confirmReset}
      />
    </>
  );
}
