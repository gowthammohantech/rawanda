import { useMemo, type ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx, type TranslationKey } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";
import { createAnchorLink, type NavLinkComponent } from "./nav-link.tsx";
import { RwandaMark } from "./RwandaMark.tsx";
import type { Tone } from "./tone.ts";

export type SidebarItem = {
  to: string;
  labelKey: TranslationKey;
  icon: IconName;
  /** Count badge (e.g. pending reviews). Rendered as a number with a translated label. */
  count?: number;
  countTone?: Tone;
  /** Exact match only (for index routes). */
  end?: boolean;
  /**
   * Visibly disabled (e.g. the persona lacks the capability): rendered as non-interactive text
   * with `aria-disabled`, and `disabledReason` as tooltip + screen-reader text.
   */
  disabled?: boolean;
  /** Translated reason shown for a disabled item. */
  disabledReason?: string;
  /** Indented child links shown under the item (ref image 4 sub-navigation). */
  children?: readonly { to: string; labelKey: TranslationKey; end?: boolean }[];
};

export type SidebarSection = {
  id?: string;
  /** Small uppercase section label; omit for the first, unlabeled group. */
  labelKey?: TranslationKey;
  items: readonly SidebarItem[];
};

export type SidebarProps = {
  sections: readonly SidebarSection[];
  /** React Router `NavLink` (recommended) or any compatible component. */
  LinkComponent?: NavLinkComponent;
  /** Current path, used only by the default anchor link. */
  activePath?: string;
  /** Brand slot (defaults to the compact RwandaMark). */
  brand?: ReactNode;
  /** Bottom slot: facility/scope card, help links. */
  footer?: ReactNode;
  /** Called after a link is chosen (closes the mobile drawer). */
  onNavigate?: () => void;
  className?: string;
};

const COUNT_TONE: Record<Tone, string> = {
  neutral: "bg-border-soft text-ink",
  info: "bg-state-info text-on-primary",
  positive: "bg-state-success text-on-primary",
  warning: "bg-risk-warning text-on-primary",
  danger: "bg-risk-danger text-on-primary",
};

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    "target-min flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
    isActive
      ? "bg-surface font-semibold text-ink shadow-card"
      : "text-ink/80 hover:bg-surface/60 hover:text-ink",
  );

const childLinkClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    "target-min flex items-center rounded-sm py-1.5 ps-3 text-[13px]",
    isActive ? "font-semibold text-ink" : "text-muted hover:text-ink",
  );

/** Grouped navigation with mono section labels and count badges (ref images). */
export function Sidebar({
  sections,
  LinkComponent,
  activePath,
  brand,
  footer,
  onNavigate,
  className,
}: SidebarProps) {
  const t = useTx();
  const Link = useMemo(
    () => LinkComponent ?? createAnchorLink(activePath),
    [LinkComponent, activePath],
  );
  return (
    <div className={cx("flex h-full flex-col gap-6", className)}>
      <div className="px-2 pt-1">{brand ?? <RwandaMark compact />}</div>
      <nav aria-label={t("shell:navigation")} className="flex-1 space-y-5 overflow-y-auto">
        {sections.map((section, sectionIndex) => (
          <div key={section.id ?? sectionIndex}>
            {section.labelKey === undefined ? null : (
              <p className="micro-label text-muted mb-1.5 px-3">{t(section.labelKey)}</p>
            )}
            <ul className="m-0 list-none space-y-0.5 p-0">
              {section.items.map((item) => (
                <li key={item.to}>
                  {item.disabled === true ? (
                    <span
                      aria-disabled="true"
                      title={item.disabledReason}
                      className="target-min text-muted flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm opacity-60"
                    >
                      <Icon name="lock" size={18} className="text-muted shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                      {item.disabledReason === undefined ? null : (
                        <span className="sr-only">{`, ${item.disabledReason}`}</span>
                      )}
                    </span>
                  ) : (
                    <Link
                      to={item.to}
                      {...(item.end === undefined ? {} : { end: item.end })}
                      className={linkClass}
                      {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
                    >
                      <Icon name={item.icon} size={18} className="text-muted shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                      {item.count === undefined || item.count === 0 ? null : (
                        <span
                          className={cx(
                            "inline-flex min-w-5 items-center justify-center rounded-sm px-1.5 font-mono text-[11px] font-medium",
                            COUNT_TONE[item.countTone ?? "neutral"],
                          )}
                        >
                          {item.count}
                        </span>
                      )}
                    </Link>
                  )}
                  {item.disabled === true ||
                  item.children === undefined ||
                  item.children.length === 0 ? null : (
                    <ul className="border-border m-0 ms-5 mt-0.5 list-none border-s p-0">
                      {item.children.map((child) => (
                        <li key={child.to}>
                          <Link
                            to={child.to}
                            {...(child.end === undefined ? {} : { end: child.end })}
                            className={childLinkClass}
                            {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
                          >
                            {t(child.labelKey)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {footer === undefined ? null : <div>{footer}</div>}
    </div>
  );
}
