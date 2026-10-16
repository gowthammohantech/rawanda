/**
 * @laif/ui-web — teal design tokens and accessible shared React components (FND-09).
 * Apps also import the stylesheet once: `import "@laif/ui-web/styles.css"`.
 * Named exports only.
 */
export const PACKAGE = "@laif/ui-web" as const;

// Tokens, i18n glue, utilities
export {
  colors,
  semanticColors,
  semanticColor,
  radii,
  fonts,
  shadows,
  focusRing,
  minTarget,
  breakpoints,
  tokens,
  contrastRatio,
  relativeLuminance,
  cssColorVar,
  TEXT_CONTRAST_PAIRS,
  type ColorToken,
  type SemanticColorToken,
} from "./tokens.ts";
export { useTx, type TranslationKey, type TranslationValues } from "./i18n.ts";
export { cx, type ClassValue } from "./cx.ts";

// Icons
export {
  ICON_DATA,
  ICON_NAMES,
  PROTOTYPE_ICON_NAMES,
  ADDED_ICON_NAMES,
  type IconName,
  type IconNode,
} from "./icons/icon-data.ts";
export { Icon, type IconProps } from "./icons/Icon.tsx";

// a11y
export { VisuallyHidden, type VisuallyHiddenProps } from "./a11y/VisuallyHidden.tsx";
export { SkipLink, type SkipLinkProps } from "./a11y/SkipLink.tsx";
export { useFocusReturn } from "./a11y/useFocusReturn.ts";

// Shared vocabulary
export { TONES, type Tone } from "./components/tone.ts";
export {
  DEFAULT_SUPPRESSION_THRESHOLD,
  isSuppressedValue,
  useMetricFormatter,
  type MetricValue,
  type SuppressedValue,
  type FormattedMetric,
} from "./components/metric-value.ts";
export {
  createAnchorLink,
  isPathActive,
  type NavLinkComponent,
  type NavLinkLikeProps,
} from "./components/nav-link.tsx";

// Brand
export { RwandaMark, type RwandaMarkProps } from "./components/RwandaMark.tsx";
export { BrandLoader, type BrandLoaderProps } from "./components/BrandLoader.tsx";

// Shell
export { AppShell, type AppShellProps } from "./components/AppShell.tsx";
export {
  Sidebar,
  type SidebarProps,
  type SidebarSection,
  type SidebarItem,
} from "./components/Sidebar.tsx";
export { Topbar, type TopbarProps, type TopbarSearch } from "./components/Topbar.tsx";
export {
  PageHeader,
  Breadcrumb,
  type PageHeaderProps,
  type BreadcrumbProps,
  type BreadcrumbItem,
} from "./components/PageHeader.tsx";
export { SubNav, type SubNavProps, type SubNavItem } from "./components/SubNav.tsx";
export { Card, type CardProps } from "./components/Card.tsx";

// Banners
export { DemoBanner } from "./components/DemoBanner.tsx";
export { RoleBanner, type RoleBannerProps } from "./components/RoleBanner.tsx";
export { OfflineBanner, type OfflineBannerProps } from "./components/OfflineBanner.tsx";
export { RuleDisclaimer, type RuleDisclaimerProps } from "./components/RuleDisclaimer.tsx";
export { InfoCallout, type InfoCalloutProps } from "./components/InfoCallout.tsx";
export { PrivacyNotice, type PrivacyNoticeProps } from "./components/PrivacyNotice.tsx";

// Data display
export { StatusChip, type StatusChipProps } from "./components/StatusChip.tsx";
export { MicroLabel, type MicroLabelProps } from "./components/MicroLabel.tsx";
export { MetricCard, type MetricCardProps } from "./components/MetricCard.tsx";
export { KpiStrip, type KpiStripProps, type KpiItem } from "./components/KpiStrip.tsx";
export { ProgressBar, type ProgressBarProps } from "./components/ProgressBar.tsx";
export { SegmentedProgress, type SegmentedProgressProps } from "./components/SegmentedProgress.tsx";
export { BarList, type BarListProps, type BarListItem } from "./components/BarList.tsx";
export { TrendChart, type TrendChartProps, type TrendSeries } from "./components/TrendChart.tsx";
export { Timeline, type TimelineProps, type TimelineItem } from "./components/Timeline.tsx";
export { ExpandableRow, type ExpandableRowProps } from "./components/ExpandableRow.tsx";
export {
  KeyValueList,
  type KeyValueListProps,
  type KeyValueItem,
} from "./components/KeyValueList.tsx";
export { Avatar, initialsOf, type AvatarProps } from "./components/Avatar.tsx";
export { ReadingDisplay, type ReadingDisplayProps } from "./components/ReadingDisplay.tsx";
export { ExplainableFlag, type ExplainableFlagProps } from "./components/ExplainableFlag.tsx";

// Tables
export {
  AccessibleDataTable,
  type AccessibleDataTableProps,
  type DataTableColumn,
  type DataTableRowAction,
  type SortState,
  type SortDirection,
} from "./components/AccessibleDataTable.tsx";
export { Tabs, type TabsProps, type TabItem } from "./components/Tabs.tsx";
export {
  FilterBar,
  type FilterBarProps,
  type FilterDefinition,
  type FilterOption,
} from "./components/FilterBar.tsx";
export { SearchInput, type SearchInputProps } from "./components/SearchInput.tsx";
export { Pagination, pageCount, type PaginationProps } from "./components/Pagination.tsx";

// Forms
export {
  Field,
  CONTROL_CLASS,
  type FieldProps,
  type FieldControlProps,
} from "./components/Field.tsx";
export { TextInput, type TextInputProps } from "./components/TextInput.tsx";
export { NumberInput, parseDecimal, type NumberInputProps } from "./components/NumberInput.tsx";
export { Select, type SelectProps, type SelectOption } from "./components/Select.tsx";
export { Textarea, type TextareaProps } from "./components/Textarea.tsx";
export {
  RadioCardGroup,
  type RadioCardGroupProps,
  type RadioCardOption,
} from "./components/RadioCardGroup.tsx";
export {
  DateTimeInput,
  kigaliWallTimeToUtcIso,
  utcIsoToKigaliWallTime,
  type DateTimeInputProps,
} from "./components/DateTimeInput.tsx";
export { Checkbox, type CheckboxProps } from "./components/Checkbox.tsx";
export {
  Stepper,
  type StepperProps,
  type StepperStep,
  type StepStatus,
} from "./components/Stepper.tsx";

// Feedback
export { ConfirmDialog, type ConfirmDialogProps } from "./components/ConfirmDialog.tsx";
export { Drawer, type DrawerProps } from "./components/Drawer.tsx";
export {
  ToastProvider,
  useToast,
  type ToastApi,
  type ToastInput,
  type ToastRecord,
} from "./components/Toast.tsx";
export { EmptyState, type EmptyStateProps } from "./components/EmptyState.tsx";
export { ErrorState, type ErrorStateProps } from "./components/ErrorState.tsx";
export { PermissionDenied, type PermissionDeniedProps } from "./components/PermissionDenied.tsx";
export {
  ConflictNotice,
  type ConflictNoticeProps,
  type ConflictRow,
} from "./components/ConflictNotice.tsx";
export { LoadingSkeleton, type LoadingSkeletonProps } from "./components/LoadingSkeleton.tsx";
export {
  AsyncBoundary,
  resolveUxState,
  errorCodeOf,
  UX_STATES,
  type AsyncBoundaryProps,
  type AsyncStatus,
  type UxState,
} from "./components/AsyncBoundary.tsx";

// Controls
export {
  Button,
  BUTTON_VARIANTS,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from "./components/Button.tsx";
export { IconButton, type IconButtonProps } from "./components/IconButton.tsx";
export { LanguageSwitcher, type LanguageSwitcherProps } from "./components/LanguageSwitcher.tsx";
export {
  PersonaSwitcher,
  type PersonaSwitcherProps,
  type PersonaOption,
} from "./components/PersonaSwitcher.tsx";
export {
  DemoToolsMenu,
  type DemoToolsMenuProps,
  type DemoFaultToggles,
  type DemoFaultKey,
  type DemoScenarioOption,
} from "./components/DemoToolsMenu.tsx";
