/** Test stand-in for `expo-font` (the real module needs the Expo native runtime). */
export function useFonts(map: Record<string, unknown>): [boolean, Error | null] {
  return [Object.keys(map).length > 0, null];
}
