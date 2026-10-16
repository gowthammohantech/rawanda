import type { ScreeningStatus } from "../enums.ts";
import { defineMachine } from "./define-machine.ts";

/** Spec §5.2: draft → submitted → review_required | no_review_required. */
export const screeningMachine = defineMachine<ScreeningStatus>("screening", {
  draft: ["submitted"],
  submitted: ["review_required", "no_review_required"],
  review_required: [],
  no_review_required: [],
});
