/**
 * Stack of one wallet tab (CTZ-09 polish). Expo web keeps every tab's stack mounted (stacked
 * absolutely, hidden from screen readers); while a tab is not focused its stack takes no
 * pointer events, so a background tab can never swallow a tap meant for the visible one.
 * Native detaches inactive tabs itself.
 */
import { Stack, useIsFocused } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";

export function TabStack() {
  const focused = useIsFocused();
  const inert = Platform.OS === "web" && !focused;
  return (
    <View style={[styles.flex, inert ? styles.inert : null]}>
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inert: { pointerEvents: "none" },
});
