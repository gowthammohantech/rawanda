/**
 * Minimal typing for `expo-font`, an optional peer of @laif/ui-native that the FND-11 Expo
 * apps install with the pinned SDK (58: `expo-font@58.0.8`). Declared here so this package
 * does not pull the Expo SDK into the lockfile (ADR-0001, FND-08 note). FND-11 may delete
 * this file once `expo-font` is installed and its own types are available.
 */
declare module "expo-font" {
  export function useFonts(map: Record<string, number | string>): [boolean, Error | null];
}
