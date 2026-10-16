/**
 * @laif/ui-native — native tokens (parity with @laif/ui-web) and accessible shared React
 * Native components for the two Expo apps (FND-10). Named exports only.
 *
 * Fonts: `useLaifFonts()` (also at `@laif/ui-native/fonts`) loads the bundled
 * `@expo-google-fonts/*` faces through the app's `expo-font`.
 */
export const PACKAGE = "@laif/ui-native" as const;

// Tokens, i18n glue, a11y helpers
export {
  colors,
  semanticColors,
  semanticColor,
  withAlpha,
  focusRing,
  spacing,
  radii,
  minTouchTarget,
  hitSlop,
  typeScale,
  maxFontSizeMultiplier,
  fontFamilies,
  shadows,
  tokens,
  type ColorToken,
  type SemanticColorToken,
  type SpacingToken,
  type TypeVariant,
  type FontFamilyToken,
} from "./tokens.ts";
export { useTx, useOptionalTx, type TranslationKey, type TranslationValues } from "./i18n.ts";
export {
  a11yState,
  announce,
  touchTarget,
  compactHitSlop,
  useReduceMotion,
  type A11yState,
  type A11yStateProps,
} from "./a11y.ts";
export { kigaliWallTimeToUtcIso, utcIsoToKigaliWallTime } from "./kigali-time.ts";
export { useLaifFonts, LAIF_FONT_ASSETS, type LaifFontsState } from "./fonts.ts";

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

// Shared vocabulary
export { TONES, TONE_COLORS, TONE_ICON, type Tone, type ToneColors } from "./components/tone.ts";
export {
  DEFAULT_SUPPRESSION_THRESHOLD,
  isSuppressedValue,
  useMetricFormatter,
  type MetricValue,
  type SuppressedValue,
  type FormattedMetric,
} from "./components/metric-value.ts";
export { AppText, type AppTextProps, type TextWeight } from "./components/AppText.tsx";

// Brand
export { RwandaMark, type RwandaMarkProps } from "./components/RwandaMark.tsx";
export { BrandSplash, type BrandSplashProps } from "./components/BrandSplash.tsx";

// Layout
export { Screen, type ScreenProps } from "./components/Screen.tsx";
export { AppHeader, type AppHeaderProps } from "./components/AppHeader.tsx";
export { Section, type SectionProps } from "./components/Section.tsx";
export { Card, type CardProps } from "./components/Card.tsx";
export { ListRow, type ListRowProps } from "./components/ListRow.tsx";
export { BottomTabBar, bottomTabBarScreenOptions, tabBarIcon } from "./components/BottomTabBar.tsx";

// Banners
export { DemoBanner } from "./components/DemoBanner.tsx";
export { RoleBanner, type RoleBannerProps } from "./components/RoleBanner.tsx";
export { OfflineBanner, type OfflineBannerProps } from "./components/OfflineBanner.tsx";
export {
  SyncStatusPill,
  syncPillVisual,
  SYNC_PILL_STATES,
  type SyncStatusPillProps,
  type SyncPillState,
  type SyncStatusInput,
  type SyncPillVisual,
} from "./components/SyncStatusPill.tsx";
export { RuleDisclaimer, type RuleDisclaimerProps } from "./components/RuleDisclaimer.tsx";
export { InfoCallout, type InfoCalloutProps } from "./components/InfoCallout.tsx";
export { PrivacyNotice, type PrivacyNoticeProps } from "./components/PrivacyNotice.tsx";

// Display
export { StatusChip, type StatusChipProps } from "./components/StatusChip.tsx";
export { MicroLabel, type MicroLabelProps } from "./components/MicroLabel.tsx";
export { MetricTile, type MetricTileProps } from "./components/MetricTile.tsx";
export {
  SummaryStrip,
  type SummaryStripProps,
  type SummaryItem,
} from "./components/SummaryStrip.tsx";
export { ReadingDisplay, type ReadingDisplayProps } from "./components/ReadingDisplay.tsx";
export { Timeline, type TimelineProps, type TimelineItem } from "./components/Timeline.tsx";
export {
  KeyValueList,
  type KeyValueListProps,
  type KeyValueItem,
} from "./components/KeyValueList.tsx";
export { EmptyState, type EmptyStateProps } from "./components/EmptyState.tsx";
export { ErrorState, type ErrorStateProps } from "./components/ErrorState.tsx";
export { PermissionDenied, type PermissionDeniedProps } from "./components/PermissionDenied.tsx";
export {
  ConflictCard,
  type ConflictCardProps,
  type ConflictRow,
} from "./components/ConflictCard.tsx";
export { ExplainableFlag, type ExplainableFlagProps } from "./components/ExplainableFlag.tsx";
export {
  TabbedFilter,
  type TabbedFilterProps,
  type TabbedFilterTab,
} from "./components/TabbedFilter.tsx";
export { LoadingState, type LoadingStateProps } from "./components/LoadingState.tsx";
export {
  ToastProvider,
  useToast,
  type ToastApi,
  type ToastInput,
  type ToastRecord,
} from "./components/Toast.tsx";

// Forms
export {
  Field,
  controlStyle,
  type FieldProps,
  type FieldControlProps,
} from "./components/Field.tsx";
export { TextField, type TextFieldProps } from "./components/TextField.tsx";
export {
  NumberField,
  parseDecimal,
  sanitiseDecimalInput,
  type NumberFieldProps,
} from "./components/NumberField.tsx";
export { CheckboxField, type CheckboxFieldProps } from "./components/CheckboxField.tsx";
export {
  RadioCardGroup,
  type RadioCardGroupProps,
  type RadioCardOption,
} from "./components/RadioCardGroup.tsx";
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from "./components/SegmentedControl.tsx";
export {
  SelectSheet,
  type SelectSheetProps,
  type SelectOption,
} from "./components/SelectSheet.tsx";
export { DateTimeField, type DateTimeFieldProps } from "./components/DateTimeField.tsx";
export { Toggle, type ToggleProps } from "./components/Toggle.tsx";
export {
  Stepper,
  type StepperProps,
  type StepperStep,
  type StepStatus,
} from "./components/Stepper.tsx";
export { ReasonField, reasonLength, type ReasonFieldProps } from "./components/ReasonField.tsx";

// Actions
export {
  Button,
  BUTTON_VARIANTS,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from "./components/Button.tsx";
export { IconButton, type IconButtonProps } from "./components/IconButton.tsx";
export { Sheet, type SheetProps } from "./components/Sheet.tsx";
export { ConfirmSheet, type ConfirmSheetProps } from "./components/ConfirmSheet.tsx";
export { LanguageSwitcher, type LanguageSwitcherProps } from "./components/LanguageSwitcher.tsx";
export {
  PersonaSwitcher,
  initialsOf,
  type PersonaSwitcherProps,
  type PersonaOption,
} from "./components/PersonaSwitcher.tsx";
export {
  DemoToolsSheet,
  type DemoToolsSheetProps,
  type DemoFaultToggles,
  type DemoFaultKey,
  type DemoScenarioOption,
} from "./components/DemoToolsSheet.tsx";

// States
export {
  AsyncView,
  resolveUxState,
  errorCodeOf,
  UX_STATES,
  type AsyncViewProps,
  type AsyncStatus,
  type UxState,
} from "./components/AsyncView.tsx";
