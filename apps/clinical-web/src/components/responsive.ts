/**
 * Shared responsive class names (CLN-11; rules documented in `styles/responsive.css`). Tailwind
 * scans this file, so the utilities below are generated.
 */

/** `@laif/ui-web` KpiStrip: two columns below 1024 (it is auto-fit from 640 otherwise). */
export const KPI_STRIP_CLASS = "max-lg:grid-cols-2! max-lg:[&>*]:border-s-0!";

/** Wrapper that turns tables into stacked cards below 1024 px. */
export const STACK_BELOW_LG_CLASS = "cw-stack-lg";

/** Detail drawers (referral, task, audit event): full screen below 1024 px. */
export const DRAWER_FULL_SCREEN_CLASS = "max-lg:max-w-none";
