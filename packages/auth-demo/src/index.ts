/**
 * @laif/auth-demo — demo personas' roles, permissions and scope checks (FND-06).
 * DEMO ROLE SWITCH — NOT AUTHENTICATION, NOT SECURITY.
 */
export const PACKAGE = "@laif/auth-demo" as const;

export * from "./permissions.ts";
export * from "./scope.ts";
export * from "./check-access.ts";
export * from "./evaluateAccess.ts";
export * from "./guards.ts";
export * from "./session.ts";
export * from "./device.ts";
