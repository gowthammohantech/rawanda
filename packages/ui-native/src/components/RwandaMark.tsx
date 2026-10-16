import { StyleSheet, View } from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";

import { useOptionalTx } from "../i18n.ts";
import { colors, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export type RwandaMarkProps = {
  compact?: boolean;
  /** `inverse` = on the dark teal splash background. */
  variant?: "default" | "inverse";
  /** Symbol only (the brand name stays the accessible label). */
  symbolOnly?: boolean;
  /** Use system fonts (the splash renders before the kit fonts have loaded). */
  systemFont?: boolean;
};

const RAYS = Array.from({ length: 12 }, (_, index) => index * 30);

/** CareConnect sun mark (ported from the prototype), drawn with react-native-svg. */
export function RwandaMark({
  compact = false,
  variant = "default",
  symbolOnly = false,
  systemFont = false,
}: RwandaMarkProps) {
  const t = useOptionalTx();
  const size = compact ? 34 : variant === "inverse" ? 86 : 42;
  const inverse = variant === "inverse";
  const name = t?.("shell:brand.name");
  const country = t?.("shell:brand.country");
  const fontReset = systemFont ? styles.system : null;
  return (
    <View
      accessible
      accessibilityRole="image"
      {...(name === undefined ? {} : { accessibilityLabel: name })}
      style={[styles.row, inverse ? styles.column : null]}
    >
      <Svg width={size} height={size} viewBox="0 0 42 42">
        <Circle cx={21} cy={21} r={21} fill={inverse ? colors.surface : colors.primary} />
        {RAYS.map((deg) => (
          <Rect
            key={deg}
            x={20}
            y={5}
            width={2}
            height={9}
            rx={1}
            fill={colors.sun}
            transform={`rotate(${deg} 21 21)`}
          />
        ))}
        <Circle cx={21} cy={21} r={7.5} fill={colors.sun} />
      </Svg>
      {symbolOnly || name === undefined ? null : (
        <View style={inverse ? styles.textCenter : null}>
          <AppText
            variant={inverse ? "display" : compact ? "body" : "bodyLarge"}
            heading
            weight="bold"
            colorValue={inverse ? colors.onPrimary : colors.primaryDark}
            style={fontReset}
          >
            {name}
          </AppText>
          {country === undefined ? null : (
            <AppText
              variant="micro"
              mono={false}
              weight="bold"
              colorValue={inverse ? colors.sun : colors.muted}
              align={inverse ? "center" : undefined}
              style={[inverse ? styles.countryInverse : styles.country, fontReset]}
            >
              {country}
            </AppText>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  column: { flexDirection: "column", gap: spacing.xl },
  textCenter: { alignItems: "center" },
  country: { letterSpacing: 2.5, fontSize: 9 },
  countryInverse: { letterSpacing: 5, fontSize: 13 },
  system: { fontFamily: undefined },
});
