import type { CareTaskStatus } from "../enums.ts";
import { defineMachine } from "./define-machine.ts";

/** open → in_progress → done; open | in_progress → cancelled_with_reason. */
export const careTaskMachine = defineMachine<CareTaskStatus>("care_task", {
  open: ["in_progress", "cancelled_with_reason"],
  in_progress: ["done", "cancelled_with_reason"],
  done: [],
  cancelled_with_reason: [],
});
