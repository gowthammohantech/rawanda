// Metro for the Expo SDK 58 app inside the pnpm workspace (ADR-0002). `getDefaultConfig`
// auto-configures monorepos (watchFolders = workspace root, hoisted node_modules), resolves the
// workspace packages' TypeScript source through their `exports`, and keeps the explicit `.ts`
// import extensions used across packages/* working. No extra resolver settings are needed.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
