/**
 * `ReferralStepper` (CLN-08, ref-image 4): the FND-09 `Stepper` with `Created → Accepted →
 * Scheduled → Completed` — numbered steps, a check for done, the step of the current status
 * highlighted (`aria-current="step"`), timestamp + actor under each reached step. A cancelled
 * referral renders the cancellation as a terminal pill (with actor and time) after the steps.
 * `focusCurrent` (changes after a successful transition) moves focus to the new step.
 */
import type { AuditEvent, PersonaId, Referral } from "@laif/domain";
import { formatDateTime, useLanguage } from "@laif/i18n";
import { StatusChip, Stepper, useTx, type StepperStep } from "@laif/ui-web";
import { useEffect, useMemo, useRef } from "react";

import { personaName } from "../timeline/people.ts";
import { referralSteps } from "./model.ts";

/** Runs after Radix's focus return of the closing dialog. */
const FOCUS_DELAY_MS = 60;

export type ReferralStepperProps = {
  referral: Referral;
  history: readonly AuditEvent[];
  /** Who created it when the history has no `referral.created` (the deciding clinician). */
  creatorId?: PersonaId | null;
  /** A changing value (e.g. the referral version after a save) moves focus to the new step. */
  focusToken?: string | number | null;
};

export function ReferralStepper({
  referral,
  history,
  creatorId = null,
  focusToken = null,
}: ReferralStepperProps) {
  const t = useTx();
  const { language } = useLanguage();
  const view = useMemo(
    () => referralSteps(referral, history, creatorId),
    [referral, history, creatorId],
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusToken === null) return;
    // After the dialog that made the change has closed and returned focus to its trigger
    // (Radix restores focus on a 0 ms timer), move focus to the new step.
    const handle = setTimeout(() => {
      const root = ref.current;
      if (root === null) return;
      const target =
        root.querySelector<HTMLElement>('[aria-current="step"]') ??
        root.querySelector<HTMLElement>('[data-testid="referral-cancelled-pill"]') ??
        [...root.querySelectorAll<HTMLElement>('li[data-status="done"]')].pop() ??
        null;
      if (target === null) return;
      target.setAttribute("tabindex", "-1");
      target.focus();
    }, FOCUS_DELAY_MS);
    return () => clearTimeout(handle);
  }, [focusToken]);

  const describe = (at: string | null, actorId: PersonaId | null): string | undefined => {
    if (at === null) return undefined;
    const actor = personaName(actorId);
    const when = formatDateTime(at, language);
    return actor === null ? when : t("clinical:referrals.stepper.byAt", { name: actor, when });
  };

  const steps: StepperStep[] = view.steps.map((step) => {
    const description = describe(step.at, step.actorId);
    return {
      id: step.id,
      label: t(`clinical:referrals.stepper.${step.id}`),
      status: step.state,
      ...(description === undefined ? {} : { description }),
    };
  });

  const cancelled = view.cancelled;
  return (
    <div ref={ref} data-testid="referral-stepper" data-status={referral.status}>
      <Stepper
        steps={steps}
        label={t("clinical:referrals.stepper.label")}
        {...(cancelled === null
          ? {}
          : {
              terminal: (
                <span
                  data-testid="referral-cancelled-pill"
                  className="flex flex-wrap items-center gap-2 text-[13px]"
                >
                  <StatusChip tone="danger" icon="close">
                    {t("clinical:referrals.stepper.cancelled")}
                  </StatusChip>
                  <span className="text-muted">{describe(cancelled.at, cancelled.actorId)}</span>
                </span>
              ),
            })}
      />
    </div>
  );
}
