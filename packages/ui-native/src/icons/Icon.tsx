import Svg, { Circle, Path } from "react-native-svg";

import { colors } from "../tokens.ts";
import { ICON_DATA, type IconName } from "./icon-data.ts";

export type IconProps = {
  name: IconName;
  size?: number;
  /** A colour token value (e.g. `colors.primaryDark`); defaults to `colors.ink`. */
  color?: string;
  strokeWidth?: number;
  /**
   * Icons are decorative by default (hidden from screen readers — the adjacent text carries
   * the meaning). Pass a translated `label` only for a standalone meaningful icon.
   */
  label?: string;
  testID?: string;
};

/** The ui-web icon set, drawn with react-native-svg (24×24 viewBox, round caps). */
export function Icon({
  name,
  size = 20,
  color = colors.ink,
  strokeWidth = 1.8,
  label,
  testID,
}: IconProps) {
  const filled = name === "dot";
  const a11y =
    label === undefined
      ? // RN ≥ 0.71 maps `aria-hidden` to accessibilityElementsHidden (iOS) and
        // importantForAccessibility="no-hide-descendants" (Android).
        { "aria-hidden": true }
      : { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label };
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      testID={testID ?? `icon-${name}`}
      {...a11y}
    >
      {ICON_DATA[name].map((node, index) =>
        node[0] === "path" ? (
          <Path key={index} d={node[1].d} />
        ) : (
          <Circle key={index} cx={node[1].cx} cy={node[1].cy} r={node[1].r} />
        ),
      )}
    </Svg>
  );
}
