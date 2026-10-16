import { useEffect, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { useReduceMotion } from "../a11y.ts";
import { useOptionalTx } from "../i18n.ts";
import { colors, radii, spacing, withAlpha } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { RwandaMark } from "./RwandaMark.tsx";

export type BrandSplashProps = {
  /** Already-translated message; defaults to `shell:brand.loading` (when i18n is ready). */
  message?: string;
};

/**
 * Port of the prototype loader: radial teal background, sun mark, moving bar. Shown by the
 * Expo apps until fonts + i18n + repository are ready. Works outside `<I18nProvider>` and
 * before fonts load (system font). No animation library: RN `Animated`, and fully static when
 * "Reduce motion" is on.
 */
export function BrandSplash({ message }: BrandSplashProps) {
  const t = useOptionalTx();
  const reduceMotion = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(0.3);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);

  const text = message ?? t?.("shell:brand.loading");
  const footer = t?.("shell:brand.footer");
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-84, 208] });

  return (
    <View
      testID="brand-splash"
      accessible
      accessibilityRole="progressbar"
      {...(text === undefined ? {} : { accessibilityLabel: text })}
      accessibilityState={{ busy: true }}
      aria-busy
      style={styles.root}
    >
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="laif-splash" cx="50%" cy="38%" r="75%">
            <Stop offset="0" stopColor={colors.loaderGlow} />
            <Stop offset="0.45" stopColor={colors.primaryDark} />
            <Stop offset="1" stopColor={colors.loaderDeep} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#laif-splash)" />
      </Svg>
      <RwandaMark variant="inverse" systemFont />
      {text === undefined ? null : (
        <AppText colorValue={withAlpha(colors.onPrimary, 0.8)} align="center" style={styles.system}>
          {text}
        </AppText>
      )}
      <View style={styles.track} testID="brand-splash-bar">
        <Animated.View style={[styles.bar, { transform: [{ translateX }] }]} />
      </View>
      {footer === undefined ? null : (
        <AppText
          variant="micro"
          mono={false}
          colorValue={withAlpha(colors.onPrimary, 0.6)}
          style={[styles.footer, styles.system]}
        >
          {footer}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxl,
    padding: spacing.xxl,
    backgroundColor: colors.primaryDark,
    overflow: "hidden",
  },
  track: {
    width: 208,
    height: 3,
    borderRadius: radii.pill,
    overflow: "hidden",
    backgroundColor: withAlpha(colors.onPrimary, 0.15),
  },
  bar: { width: 84, height: 3, borderRadius: radii.pill, backgroundColor: colors.sun },
  footer: { position: "absolute", bottom: spacing.xxxl + spacing.xs },
  system: { fontFamily: undefined },
});
