// vitest-axe 0.1 augments the legacy `Vi` namespace; register its matcher on Vitest 3's types.
import "vitest";

declare module "vitest" {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): unknown;
  }
}
