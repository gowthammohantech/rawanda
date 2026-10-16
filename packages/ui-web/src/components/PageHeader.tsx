import { useMemo, type ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { createAnchorLink, type NavLinkComponent } from "./nav-link.tsx";

export type BreadcrumbItem = { label: string; to?: string };

export type BreadcrumbProps = {
  items: readonly BreadcrumbItem[];
  LinkComponent?: NavLinkComponent;
  className?: string;
};

/** "Advisors › Growth Strategy Advisor › Knowledge"; the last item is the current page. */
export function Breadcrumb({ items, LinkComponent, className }: BreadcrumbProps) {
  const t = useTx();
  const Link = useMemo(() => LinkComponent ?? createAnchorLink(undefined), [LinkComponent]);
  return (
    <nav aria-label={t("common:ui.breadcrumb")} className={className}>
      <ol className="text-muted m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-[13px]">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
              {index === 0 ? null : <Icon name="chevron" size={12} className="text-subtle" />}
              {last || item.to === undefined ? (
                <span aria-current={last ? "page" : undefined} className={cx(last && "text-ink")}>
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} end className="hover:text-ink hover:underline">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type PageHeaderProps = {
  /** Translated page title (the page's `<h1>`). */
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: readonly BreadcrumbItem[];
  LinkComponent?: NavLinkComponent;
  /** Leading avatar (ref image 3). */
  leading?: ReactNode;
  /** Chip after the title (e.g. a status or "Growth Strategy Advisor" pill). */
  titleAdornment?: ReactNode;
  /** Right-aligned secondary buttons. */
  secondaryActions?: ReactNode;
  /** Right-aligned primary button. */
  primaryAction?: ReactNode;
  className?: string;
};

/** Breadcrumb, title, subtitle and right-aligned secondary + primary actions. */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  LinkComponent,
  leading,
  titleAdornment,
  secondaryActions,
  primaryAction,
  className,
}: PageHeaderProps) {
  return (
    <header className={cx("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          {breadcrumbs === undefined || breadcrumbs.length === 0 ? null : (
            <Breadcrumb
              items={breadcrumbs}
              {...(LinkComponent === undefined ? {} : { LinkComponent })}
              className="mb-1"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-ink m-0 text-[22px] leading-tight font-semibold sm:text-2xl">
              {title}
            </h1>
            {titleAdornment}
          </div>
          {subtitle === undefined ? null : <p className="text-muted mt-1 text-sm">{subtitle}</p>}
        </div>
      </div>
      {secondaryActions === undefined && primaryAction === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </header>
  );
}
