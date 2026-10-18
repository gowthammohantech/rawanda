/**
 * Rail marker per timeline state (CTZ-06 task 3) — the SHAPE differs per state so it reads in
 * greyscale too (never colour-only; the row always carries the chip text as well):
 * done = filled circle + check, waiting = hollow circle + clock hands, changed = pencil,
 * cancelled = circle with a slash, info = small dot. Decorative (hidden from screen readers).
 */
import { type TranslationKey, type Tone, type IconName, usePalette } from "@laif/ui-native";
import Svg, { Circle, Path } from "react-native-svg";

import type { TimelineState } from "./buildCitizenTimeline.ts";

export type StateSpec = {
  /** Chip text key (null = no visible chip; the a11y label still names the state). */
  chipKey: TranslationKey | null;
  a11yKey: TranslationKey;
  tone: Tone;
  chipIcon: IconName;
};

export const STATE_SPECS: Record<TimelineState, StateSpec> = {
  done: {
    chipKey: "citizen:timeline.chip.done",
    a11yKey: "citizen:timeline.chip.done",
    tone: "positive",
    chipIcon: "check",
  },
  waiting: {
    chipKey: "citizen:timeline.chip.waiting",
    a11yKey: "citizen:timeline.chip.waiting",
    tone: "warning",
    chipIcon: "clock",
  },
  changed: {
    chipKey: "citizen:timeline.chip.updated",
    a11yKey: "citizen:timeline.chip.updated",
    tone: "info",
    chipIcon: "file",
  },
  cancelled: {
    chipKey: "citizen:timeline.chip.cancelled",
    a11yKey: "citizen:timeline.chip.cancelled",
    tone: "neutral",
    chipIcon: "minus",
  },
  info: {
    chipKey: null,
    a11yKey: "citizen:timeline.chip.info",
    tone: "neutral",
    chipIcon: "dot",
  },
};

const SIZE = 24;

export function TimelineStateIcon({ state }: { state: TimelineState }) {
  const palette = usePalette();
  const common = {
    width: SIZE,
    height: SIZE,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true,
    testID: `timeline-icon-${state}`,
  } as const;
  switch (state) {
    case "done":
      return (
        <Svg {...common}>
          <Circle cx={12} cy={12} r={10} fill={palette.positive} />
          <Path
            d="m7.5 12.2 3 3 6-6.4"
            stroke={palette.onPrimary}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "waiting":
      return (
        <Svg {...common}>
          <Circle
            cx={12}
            cy={12}
            r={9}
            fill={palette.surface}
            stroke={palette.warning}
            strokeWidth={2}
          />
          <Path
            d="M12 7.5V12l3 2"
            stroke={palette.warning}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "changed":
      return (
        <Svg {...common}>
          <Circle cx={12} cy={12} r={10} fill={palette.infoSoft} />
          <Path
            d="M8 16.2 8.6 13.4l5.6-5.6a1.4 1.4 0 0 1 2 2l-5.6 5.6zM13.2 8.8l2 2"
            stroke={palette.info}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "cancelled":
      return (
        <Svg {...common}>
          <Circle
            cx={12}
            cy={12}
            r={9}
            fill={palette.surface}
            stroke={palette.muted}
            strokeWidth={2}
          />
          <Path d="m6 18 12-12" stroke={palette.muted} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      );
    case "info":
      return (
        <Svg {...common}>
          <Circle cx={12} cy={12} r={4} fill={palette.subtle} />
        </Svg>
      );
  }
}
