/**
 * Responsive clinical navigation (CLN-11 task 3, spec §7 responsive):
 *
 * | Viewport       | Navigation                                                           |
 * |----------------|----------------------------------------------------------------------|
 * | ≥ 1280 px      | full `@laif/ui-web` Sidebar (labels, section titles, count badges)   |
 * | 1024–1279 px   | collapsed icon rail: icon links with visible tooltips on hover/focus |
 * | < 1024 px      | off-canvas drawer behind the topbar hamburger (AppShell's `Drawer`,  |
 * |                | Radix Dialog: focus trap, Escape closes, focus returns to the button)|
 *
 * The AppShell renders `sidebar` inline (≥ 1024) and clones it into its drawer with
 * `onNavigate`; with `onNavigate` this component therefore renders the full sidebar only. The
 * inline column width is `w-16 xl:w-60` (`RAIL_WIDTH_CLASS`, passed to AppShell). Links are
 * React Router `NavLink`s, so the active one carries `aria-current="page"` in every mode.
 */
import {
  Icon,
  RwandaMark,
  Sidebar,
  useTx,
  type IconName,
  type SidebarSection,
  type TranslationKey,
} from "@laif/ui-web";
import { NavLink } from "react-router";

import { MEDIA, useMediaQuery } from "../../app/useMediaQuery.ts";

export const RAIL_WIDTH_CLASS = "w-16 xl:w-60";

export type FooterLink = { id: string; to: string; labelKey: TranslationKey; icon: IconName };

export type ResponsiveSidebarProps = {
  sections: readonly SidebarSection[];
  footerLinks: readonly FooterLink[];
  onHelp: () => void;
  /** Translated "Active facility: …" card text (full sidebar only; the rail shows a tooltip). */
  facilityText: string;
  /** Set by AppShell when the sidebar is shown in the mobile drawer. */
  onNavigate?: () => void;
};

const FOOTER_LINK =
  "target-min flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors";
const RAIL_ITEM =
  "group relative target-min flex size-11 items-center justify-center rounded-md transition-colors";
const RAIL_TOOLTIP =
  "pointer-events-none absolute start-full top-1/2 z-40 ms-2 -translate-y-1/2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-xs font-medium text-on-primary opacity-0 shadow-overlay transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none";

function railLinkClass({ isActive }: { isActive: boolean }) {
  return `${RAIL_ITEM} ${
    isActive ? "bg-surface text-ink shadow-card" : "text-ink/80 hover:bg-surface/60 hover:text-ink"
  }`;
}

export function ResponsiveSidebar(props: ResponsiveSidebarProps) {
  const rail = useMediaQuery(MEDIA.rail);
  if (props.onNavigate !== undefined || !rail) {
    return (
      <div className="h-full" data-testid="sidebar-full">
        <FullSidebar {...props} />
      </div>
    );
  }
  return (
    <div className="h-full" data-testid="sidebar-rail">
      <IconRail {...props} />
    </div>
  );
}

function FullSidebar({
  sections,
  footerLinks,
  onHelp,
  facilityText,
  onNavigate,
}: ResponsiveSidebarProps) {
  const t = useTx();
  const footer = (
    <div className="space-y-3">
      <ul className="m-0 list-none space-y-0.5 p-0">
        {footerLinks.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.to}
              {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
              className={({ isActive }) =>
                `${FOOTER_LINK} ${
                  isActive
                    ? "bg-surface text-ink shadow-card font-semibold"
                    : "text-ink/80 hover:bg-surface/60 hover:text-ink"
                }`
              }
            >
              <Icon name={item.icon} size={18} className="text-muted shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
            </NavLink>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              onHelp();
            }}
            className={`${FOOTER_LINK} text-ink/80 hover:bg-surface/60 hover:text-ink w-full text-start`}
          >
            <Icon name="info" size={18} className="text-muted shrink-0" />
            <span className="min-w-0 flex-1 truncate">{t("clinical:nav.help")}</span>
          </button>
        </li>
      </ul>
      <p className="border-border-soft bg-surface text-muted rounded-md border px-3 py-2 text-xs">
        {facilityText}
      </p>
    </div>
  );
  return (
    <Sidebar
      sections={sections}
      LinkComponent={NavLink}
      footer={footer}
      {...(onNavigate === undefined ? {} : { onNavigate })}
    />
  );
}

function IconRail({ sections, footerLinks, onHelp, facilityText }: ResponsiveSidebarProps) {
  const t = useTx();
  return (
    <div className="flex h-full flex-col items-center gap-5">
      <div className="pt-1">
        <RwandaMark compact symbolOnly />
      </div>
      <nav aria-label={t("shell:navigation")} className="flex-1">
        {sections.map((section, index) => (
          <ul
            key={section.id ?? index}
            className="border-border-soft m-0 list-none space-y-1 p-0 [&:not(:first-child)]:mt-3 [&:not(:first-child)]:border-t [&:not(:first-child)]:pt-3"
            {...(section.labelKey === undefined ? {} : { "aria-label": t(section.labelKey) })}
          >
            {section.items.map((item) => {
              const label = t(item.labelKey);
              const countText =
                item.count === undefined || item.count === 0 ? "" : ` (${item.count})`;
              return (
                <li key={item.to}>
                  {item.disabled === true ? (
                    <span
                      role="link"
                      aria-disabled="true"
                      tabIndex={0}
                      aria-label={`${label}, ${item.disabledReason ?? ""}`}
                      className={`${RAIL_ITEM} text-muted cursor-not-allowed opacity-60`}
                    >
                      <Icon name="lock" size={18} />
                      <span aria-hidden="true" className={RAIL_TOOLTIP}>
                        {item.disabledReason === undefined
                          ? label
                          : `${label} — ${item.disabledReason}`}
                      </span>
                    </span>
                  ) : (
                    <NavLink
                      to={item.to}
                      aria-label={`${label}${countText}`}
                      className={railLinkClass}
                    >
                      <Icon name={item.icon} size={20} />
                      {countText === "" ? null : (
                        <span
                          aria-hidden="true"
                          className="bg-risk-warning text-on-primary absolute end-0.5 top-0.5 inline-flex min-w-4 items-center justify-center rounded-sm px-1 font-mono text-[10px] leading-4"
                        >
                          {item.count}
                        </span>
                      )}
                      <span aria-hidden="true" className={RAIL_TOOLTIP}>
                        {label}
                      </span>
                    </NavLink>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
      </nav>
      <ul className="m-0 list-none space-y-1 p-0">
        {footerLinks.map((item) => (
          <li key={item.id}>
            <NavLink to={item.to} aria-label={t(item.labelKey)} className={railLinkClass}>
              <Icon name={item.icon} size={20} />
              <span aria-hidden="true" className={RAIL_TOOLTIP}>
                {t(item.labelKey)}
              </span>
            </NavLink>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onHelp}
            aria-label={t("clinical:nav.help")}
            className={`${RAIL_ITEM} text-ink/80 hover:bg-surface/60 hover:text-ink`}
          >
            <Icon name="info" size={20} />
            <span aria-hidden="true" className={RAIL_TOOLTIP}>
              {t("clinical:nav.help")}
            </span>
          </button>
        </li>
        <li>
          <span
            role="img"
            aria-label={facilityText}
            title={facilityText}
            className={`${RAIL_ITEM} text-muted`}
            data-testid="rail-facility"
          >
            <Icon name="home" size={18} />
            <span aria-hidden="true" className={RAIL_TOOLTIP}>
              {facilityText}
            </span>
          </span>
        </li>
      </ul>
    </div>
  );
}
