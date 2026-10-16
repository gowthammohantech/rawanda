import type { ReactNode } from "react";
import type { StyleProp, TextStyle } from "react-native";

import { AppText } from "./AppText.tsx";
import { TONE_COLORS, type Tone } from "./tone.ts";

export type MicroLabelProps = {
  children: ReactNode;
  tone?: Tone;
  /** Announce as a heading (section titles). */
  heading?: boolean;
  style?: StyleProp<TextStyle>;
  testID?: string;
};

/** Monospace uppercase micro-label (`PRIMARY CONSTRAINT`, `NEEDS YOU`). */
export function MicroLabel({
  children,
  tone = "neutral",
  heading = false,
  style,
  testID,
}: MicroLabelProps) {
  return (
    <AppText
      variant="micro"
      colorValue={TONE_COLORS[tone].fg}
      {...(heading ? { accessibilityRole: "header" as const } : {})}
      {...(testID === undefined ? {} : { testID })}
      {...(style === undefined ? {} : { style })}
    >
      {children}
    </AppText>
  );
}
