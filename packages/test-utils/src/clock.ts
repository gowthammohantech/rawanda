/** `createTestClock(iso?)` — a frozen demo clock pinned at `DEMO_CLOCK_DEFAULT_ISO` (or `iso`). */
import { createDemoClock, DEMO_CLOCK_DEFAULT_ISO, type DemoClock } from "@laif/domain";

export { DEMO_CLOCK_DEFAULT_ISO };

export function createTestClock(iso: string = DEMO_CLOCK_DEFAULT_ISO): DemoClock {
  return createDemoClock({ pinnedIso: iso, mode: "frozen" });
}
