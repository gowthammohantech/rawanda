/**
 * Clinical page header pattern (CLN-01): breadcrumb, title (the page `<h1>` and the document
 * title), subtitle and a right-aligned actions slot. Wraps the `@laif/ui-web` PageHeader with
 * React Router links.
 */
import { PageHeader as UiPageHeader, type BreadcrumbItem } from "@laif/ui-web";
import type { ReactNode } from "react";
import { NavLink } from "react-router";

import { useDocumentTitle } from "../app/pages/useDocumentTitle.ts";

export type PageHeaderProps = {
  /** Translated title. */
  title: string;
  subtitle?: ReactNode;
  breadcrumbs?: readonly BreadcrumbItem[];
  /** Right-aligned actions (secondary buttons first, the primary one last). */
  actions?: ReactNode;
  titleAdornment?: ReactNode;
};

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  titleAdornment,
}: PageHeaderProps) {
  useDocumentTitle(title);
  return (
    <UiPageHeader
      title={title}
      LinkComponent={NavLink}
      {...(subtitle === undefined ? {} : { subtitle })}
      {...(breadcrumbs === undefined ? {} : { breadcrumbs })}
      {...(actions === undefined ? {} : { primaryAction: actions })}
      {...(titleAdornment === undefined ? {} : { titleAdornment })}
    />
  );
}
