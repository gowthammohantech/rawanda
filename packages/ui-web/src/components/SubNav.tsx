import { useMemo } from "react";

import { cx } from "../cx.ts";
import { useTx, type TranslationKey } from "../i18n.ts";
import { createAnchorLink, type NavLinkComponent } from "./nav-link.tsx";

export type SubNavItem = { to: string; labelKey: TranslationKey; count?: number; end?: boolean };

export type SubNavProps = {
  items: readonly SubNavItem[];
  LinkComponent?: NavLinkComponent;
  activePath?: string;
  /** Accessible name; defaults to `shell:subNavigation`. */
  labelKey?: TranslationKey;
  className?: string;
};

/** Indented child navigation with a left rail (ref image 4: Overview / Knowledge / …). */
export function SubNav({ items, LinkComponent, activePath, labelKey, className }: SubNavProps) {
  const t = useTx();
  const Link = useMemo(
    () => LinkComponent ?? createAnchorLink(activePath),
    [LinkComponent, activePath],
  );
  return (
    <nav aria-label={t(labelKey ?? "shell:subNavigation")} className={className}>
      <ul className="border-border m-0 list-none border-s p-0">
        {items.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              {...(item.end === undefined ? {} : { end: item.end })}
              className={({ isActive }) =>
                cx(
                  "target-min -ms-px flex items-center justify-between gap-2 border-s-2 py-1.5 ps-3 pe-2 text-[13px]",
                  isActive
                    ? "border-primary text-ink font-semibold"
                    : "text-muted hover:text-ink border-transparent",
                )
              }
            >
              <span>{t(item.labelKey)}</span>
              {item.count === undefined ? null : (
                <span className="text-muted font-mono text-[11px]">{item.count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
