import * as Menu from "@radix-ui/react-dropdown-menu";

import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { Avatar } from "./Avatar.tsx";

export type PersonaOption = {
  id: string;
  /** Synthetic display name. */
  name: string;
  /** Translated role label. */
  roleLabel: string;
  /** Translated scope (facility / district). */
  scopeLabel?: string;
};

export type PersonaSwitcherProps = {
  personas: readonly PersonaOption[];
  value: string;
  onChange: (personaId: string) => void;
  /** Extra menu items (e.g. "End session"). */
  extraItems?: readonly { id: string; label: string; onSelect: () => void }[];
};

/** Avatar menu for the demo persona switch — labelled demo-only, never authentication. */
export function PersonaSwitcher({
  personas,
  value,
  onChange,
  extraItems = [],
}: PersonaSwitcherProps) {
  const t = useTx();
  const current = personas.find((persona) => persona.id === value);
  return (
    <Menu.Root>
      {/* Named by its content (no aria-label), so the accessible name always contains the
          visible text (WCAG 2.5.3 label in name): "<name> Demo, Switch demo persona". */}
      <Menu.Trigger className="target-min rounded-pill border-border-soft bg-surface hover:bg-background inline-flex items-center gap-2 border py-1 ps-1 pe-2">
        <Avatar name={current?.name ?? "?"} size="sm" decorative />
        {current === undefined ? null : (
          <span className="text-ink sr-only max-w-40 truncate text-[13px] font-medium lg:not-sr-only">
            {current.name}
          </span>
        )}
        <span className="micro-label rounded-pill bg-demo-banner-bg text-demo-banner-fg hidden px-1.5 lg:inline">
          {t("demo:badge")}
        </span>
        <span className="sr-only">{`, ${t("shell:persona.switch")}`}</span>
        <Icon name="chevron-down" size={14} className="text-muted" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          className="border-border-soft bg-surface shadow-overlay z-50 w-72 rounded-md border p-1"
        >
          <Menu.Label className="text-ink px-2 pt-2 text-[13px] font-semibold">
            {t("shell:persona.switch")}
          </Menu.Label>
          <p className="text-demo-banner-fg px-2 pb-2 text-xs">{t("demo:demoRoleSwitcher")}</p>
          <Menu.RadioGroup value={value} onValueChange={onChange}>
            {personas.map((persona) => (
              <Menu.RadioItem
                key={persona.id}
                value={persona.id}
                className="data-[highlighted]:bg-background data-[state=checked]:bg-primary-soft flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 outline-none"
              >
                <Avatar name={persona.name} size="sm" decorative />
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-[13px] font-medium">
                    {persona.name}
                  </span>
                  <span className="text-muted block truncate text-xs">
                    {persona.scopeLabel === undefined
                      ? persona.roleLabel
                      : `${persona.roleLabel} · ${persona.scopeLabel}`}
                  </span>
                </span>
                <Menu.ItemIndicator>
                  <Icon name="check" size={16} className="text-primary-dark" />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
          {extraItems.length === 0 ? null : (
            <>
              <Menu.Separator className="bg-border-soft my-1 h-px" />
              {extraItems.map((item) => (
                <Menu.Item
                  key={item.id}
                  onSelect={item.onSelect}
                  className="text-ink data-[highlighted]:bg-background cursor-pointer rounded-sm px-2 py-2 text-[13px] outline-none"
                >
                  {item.label}
                </Menu.Item>
              ))}
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
