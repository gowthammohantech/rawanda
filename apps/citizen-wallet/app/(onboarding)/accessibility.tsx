/** Accessibility before a persona is chosen (welcome footer; CTZ-08 task 11): device-only. */
import { AccessibilityScreen } from "../../src/features/settings/AccessibilityScreen.tsx";

export default function Route() {
  return <AccessibilityScreen fallback="/welcome" />;
}
