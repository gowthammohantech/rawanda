/**
 * Native design tokens (FND-10 task 2). Colour names and values are IDENTICAL to
 * `@laif/ui-web` `tokens.ts` — `tokens.parity.test.ts` fails on any drift. Everything else
 * (spacing, type scale, touch targets) is native-specific.
 *
 * Dynamic type: font sizes here are the 1× sizes. The OS multiplies them by the user's font
 * scale through `allowFontScaling` (never disabled in this kit); only dense rows cap the
 * multiplier at `maxFontSizeMultiplier.dense`.
 */

export const colors = {
  primary: "#087F8C",
  primaryDark: "#075D66",
  primarySoft: "#E8F5F5",
  positive: "#1B7653",
  positiveSoft: "#EAF6F0",
  warning: "#A15D00",
  warningSoft: "#FFF4DF",
  danger: "#B42318",
  dangerSoft: "#FFF0EE",
  info: "#2463A0",
  infoSoft: "#EDF5FC",
  ink: "#18252B",
  muted: "#5B6870",
  subtle: "#66737A",
  background: "#F7FAFA",
  canvas: "#E9ECEC",
  surface: "#FFFFFF",
  border: "#D9E2E4",
  borderSoft: "#E8EDEF",
  demoBannerBg: "#FFF7E7",
  demoBannerFg: "#79500C",
  demoBannerBorder: "#EEDDBD",
  /** RwandaMark sun (prototype `.sun-core`). */
  sun: "#F4C54E",
  /** BrandSplash radial gradient stops (prototype `.loader`). */
  loaderGlow: "#15939E",
  loaderDeep: "#043D45",
  onPrimary: "#FFFFFF",
} as const;

export type ColorToken = keyof typeof colors;

/** Semantic aliases → base colour token (same map as ui-web). */
export const semanticColors = {
  riskWarning: "warning",
  riskWarningSoft: "warningSoft",
  riskDanger: "danger",
  riskDangerSoft: "dangerSoft",
  stateSuccess: "positive",
  stateSuccessSoft: "positiveSoft",
  stateInfo: "info",
  stateInfoSoft: "infoSoft",
  syncPending: "info",
  syncPendingSoft: "infoSoft",
  syncConflict: "danger",
  syncConflictSoft: "dangerSoft",
} as const satisfies Record<string, ColorToken>;

export type SemanticColorToken = keyof typeof semanticColors;

/** Resolves a semantic alias to its hex value. */
export function semanticColor(token: SemanticColorToken): string {
  return colors[semanticColors[token]];
}

/** `#RRGGBB` + opacity → `rgba(...)` (hairline tinted borders, overlays). */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) throw new RangeError(`Expected #RRGGBB, got ${hex}`);
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => parseInt(part ?? "0", 16));
  return `rgba(${r ?? 0}, ${g ?? 0}, ${b ?? 0}, ${alpha})`;
}

/** Visible focus ring (keyboard / switch access on Android & Expo web): same as ui-web. */
export const focusRing = { width: 3, color: withAlpha(colors.primary, 0.24), offset: 2 } as const;

/** 4-pt spacing scale. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;
export type SpacingToken = keyof typeof spacing;

/** Radii in pt: same scale as ui-web (8 / 12 / 16 / 24, pill). */
export const radii = { sm: 8, md: 12, lg: 16, xl: 24, shell: 24, pill: 999 } as const;

/** Minimum touch target (pt) for every pressable in the kit (≥ 44 × 44, tech spec §7). */
export const minTouchTarget = 44;

/** Extra touch slop around compact controls (chips, icon buttons, switches). */
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** Type scale (1× sizes; the OS scales them with the user's font size). */
export const typeScale = {
  micro: { fontSize: 11, lineHeight: 15, letterSpacing: 0.6 },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  body: { fontSize: 15, lineHeight: 21, letterSpacing: 0 },
  bodyLarge: { fontSize: 17, lineHeight: 24, letterSpacing: 0 },
  title: { fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  display: { fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
} as const;
export type TypeVariant = keyof typeof typeScale;

/** Font-size multiplier caps: dense rows only (everything else scales freely). */
export const maxFontSizeMultiplier = { dense: 1.6 } as const;

/**
 * Font family names as registered by `useLaifFonts()` (`@expo-google-fonts/*`, bundled).
 * On native a custom family carries its own weight, so pick the family, not `fontWeight`.
 */
export const fontFamilies = {
  sans: "DMSans_400Regular",
  sansMedium: "DMSans_500Medium",
  sansSemiBold: "DMSans_600SemiBold",
  sansBold: "DMSans_700Bold",
  displaySemiBold: "Manrope_600SemiBold",
  display: "Manrope_700Bold",
  displayExtraBold: "Manrope_800ExtraBold",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
} as const;
export type FontFamilyToken = keyof typeof fontFamilies;

/** RN shadow presets (iOS shadow* + Android elevation), mirroring ui-web `shadows`. */
export const shadows = {
  card: {
    shadowColor: colors.ink,
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  raised: {
    shadowColor: colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  overlay: {
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 22 },
    elevation: 12,
  },
} as const;

export const tokens = {
  colors,
  semanticColors,
  spacing,
  radii,
  typeScale,
  fontFamilies,
  shadows,
  focusRing,
  minTouchTarget,
  hitSlop,
  maxFontSizeMultiplier,
} as const;
