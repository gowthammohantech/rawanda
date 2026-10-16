import { useState, type ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { IconButton } from "./IconButton.tsx";
import { LanguageSwitcher } from "./LanguageSwitcher.tsx";
import { SearchInput } from "./SearchInput.tsx";

export type TopbarSearch = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  disabled?: boolean;
};

export type TopbarProps = {
  /** Controlled search; omit for an inert placeholder search (FND-11 shells). */
  search?: TopbarSearch;
  /** Replace the search box entirely (or `null` to hide it). */
  searchSlot?: ReactNode;
  /** Notification bell with an unread dot. */
  notifications?: { hasUnread: boolean; onClick: () => void };
  /** Persona / avatar menu (usually `PersonaSwitcher`). */
  persona?: ReactNode;
  /** Demo tools menu (usually `DemoToolsMenu`). */
  demoTools?: ReactNode;
  /** Shows the hamburger below 1024 px; AppShell wires it to the navigation drawer. */
  onOpenNavigation?: () => void;
  className?: string;
};

/** Search (⌘K hint), notifications, persona, demo tools and the always-present LanguageSwitcher. */
export function Topbar({
  search,
  searchSlot,
  notifications,
  persona,
  demoTools,
  onOpenNavigation,
  className,
}: TopbarProps) {
  const t = useTx();
  const [localQuery, setLocalQuery] = useState("");
  const query = search?.value ?? localQuery;
  const setQuery = search?.onValueChange ?? setLocalQuery;

  return (
    <div className={cx("flex items-center gap-2 sm:gap-3", className)}>
      {onOpenNavigation === undefined ? null : (
        <IconButton
          icon="menu"
          labelKey="shell:menu.open"
          tooltip={false}
          onClick={onOpenNavigation}
          className="lg:hidden"
        />
      )}
      <div className="min-w-0 flex-1">
        {searchSlot !== undefined ? (
          searchSlot
        ) : (
          <form
            role="search"
            className="max-w-md"
            onSubmit={(event) => {
              event.preventDefault();
              search?.onSubmit?.(query);
            }}
          >
            <SearchInput
              label={t("shell:search.label")}
              placeholder={t("shell:search.placeholder")}
              shortcut="⌘K"
              shortcutLabel={t("shell:search.shortcutHint")}
              value={query}
              onValueChange={setQuery}
              {...(search?.disabled === true ? { disabled: true } : {})}
            />
          </form>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {demoTools}
        <LanguageSwitcher />
        {notifications === undefined ? null : (
          <IconButton
            icon="bell"
            labelKey="shell:notifications.label"
            variant="outline"
            badge={notifications.hasUnread}
            badgeLabelKey="shell:notifications.unread"
            onClick={notifications.onClick}
          />
        )}
        {persona}
      </div>
    </div>
  );
}
