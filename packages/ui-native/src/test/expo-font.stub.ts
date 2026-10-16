/** Test stand-in for `expo-font` (an optional peer installed by the FND-11 Expo apps). */
export function useFonts(map: Record<string, unknown>): [boolean, Error | null] {
  return [Object.keys(map).length > 0, null];
}
