import type { ReactNode } from "react";
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from "react-native";

import {
  colors,
  fontFamilies,
  maxFontSizeMultiplier,
  typeScale,
  type ColorToken,
  type TypeVariant,
} from "../tokens.ts";

export type TextWeight = "regular" | "medium" | "semibold" | "bold";

export type AppTextProps = Omit<TextProps, "allowFontScaling" | "style"> & {
  /** Type scale step; `micro` = mono uppercase micro-label. */
  variant?: TypeVariant;
  weight?: TextWeight;
  /** Colour token name (defaults to `ink`). */
  color?: ColorToken;
  /** Use a raw token value instead (tone colours). */
  colorValue?: string;
  /** Manrope heading face (used by `title` / `display` by default). */
  heading?: boolean;
  /** JetBrains Mono (micro-labels, chips, codes). */
  mono?: boolean;
  /** Uppercase with tracking (mono micro-label style). */
  caps?: boolean;
  /** Dense rows (chips, tab badges): caps dynamic type at 1.6× instead of unlimited. */
  dense?: boolean;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
};

function familyFor(heading: boolean, mono: boolean, weight: TextWeight): string {
  if (mono) return weight === "regular" ? fontFamilies.mono : fontFamilies.monoMedium;
  if (heading) {
    if (weight === "bold") return fontFamilies.display;
    return fontFamilies.displaySemiBold;
  }
  switch (weight) {
    case "bold":
      return fontFamilies.sansBold;
    case "semibold":
      return fontFamilies.sansSemiBold;
    case "medium":
      return fontFamilies.sansMedium;
    default:
      return fontFamilies.sans;
  }
}

/**
 * The kit's only text primitive: token font family/size/colour, and dynamic type ALWAYS on
 * (`allowFontScaling` cannot be turned off through this component).
 */
export function AppText({
  variant = "body",
  weight,
  color = "ink",
  colorValue,
  heading,
  mono,
  caps,
  dense = false,
  align,
  style,
  children,
  ...rest
}: AppTextProps) {
  const isMicro = variant === "micro";
  const isHeading = heading ?? (variant === "title" || variant === "display");
  const isMono = mono ?? isMicro;
  const isCaps = caps ?? isMicro;
  const resolvedWeight = weight ?? (isHeading ? "bold" : isMicro ? "medium" : "regular");
  const scale = typeScale[variant];
  return (
    <Text
      {...rest}
      allowFontScaling
      {...(dense ? { maxFontSizeMultiplier: maxFontSizeMultiplier.dense } : {})}
      style={[
        styles.base,
        {
          fontFamily: familyFor(isHeading, isMono, resolvedWeight),
          fontSize: scale.fontSize,
          lineHeight: scale.lineHeight,
          letterSpacing: isCaps ? Math.max(scale.letterSpacing, 0.6) : scale.letterSpacing,
          color: colorValue ?? colors[color],
        },
        isCaps ? styles.caps : null,
        align === undefined ? null : { textAlign: align },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { flexShrink: 1 },
  caps: { textTransform: "uppercase" },
});
