import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

import { cx } from "../cx.ts";

export type TabItem = {
  value: string;
  /** Translated tab label. */
  label: string;
  /** Count badge ("Needs you 8"). */
  count?: number | string;
  content?: ReactNode;
  disabled?: boolean;
};

export type TabsProps = {
  tabs: readonly TabItem[];
  /** Accessible name of the tab list (already translated). */
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Right-aligned controls in the tab bar (e.g. a sort select). */
  actions?: ReactNode;
  className?: string;
};

/** Radix tabs with count badges (ref images 4/5); arrow keys move between tabs. */
export function Tabs({
  tabs,
  label,
  value,
  defaultValue,
  onValueChange,
  actions,
  className,
}: TabsProps) {
  const rootProps = {
    ...(value === undefined ? {} : { value }),
    ...(onValueChange === undefined ? {} : { onValueChange }),
    defaultValue: defaultValue ?? tabs[0]?.value,
  };
  return (
    <RadixTabs.Root {...rootProps} className={cx("w-full", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <RadixTabs.List aria-label={label} className="flex flex-wrap gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <RadixTabs.Trigger
              key={tab.value}
              value={tab.value}
              {...(tab.disabled === true ? { disabled: true } : {})}
              className={cx(
                "group target-min text-muted inline-flex items-center gap-2 rounded-t-md px-4 py-2.5 text-sm",
                "hover:text-ink data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:font-semibold",
                "disabled:opacity-50",
              )}
            >
              {tab.label}
              {tab.count === undefined ? null : (
                <span className="text-muted group-data-[state=active]:text-primary-dark font-mono text-xs">
                  {tab.count}
                </span>
              )}
            </RadixTabs.Trigger>
          ))}
        </RadixTabs.List>
        {actions === undefined ? null : <div className="pb-1.5">{actions}</div>}
      </div>
      {tabs.map((tab) =>
        tab.content === undefined ? null : (
          <RadixTabs.Content
            key={tab.value}
            value={tab.value}
            className="bg-surface rounded-tr-lg rounded-b-lg p-4"
          >
            {tab.content}
          </RadixTabs.Content>
        ),
      )}
    </RadixTabs.Root>
  );
}
