/** All domain services over one engine (local device / web store, or the simulated remote). */
import type { Engine } from "../core/engine.ts";
import { createAccessGrantService } from "./access-grants.ts";
import { createAdminSettingsService } from "./admin-settings.ts";
import { createAuditService } from "./audit.ts";
import { createFollowUpService } from "./follow-ups.ts";
import { createInstructionService } from "./instructions.ts";
import { createMetricsService } from "./metrics.ts";
import { createPatientService } from "./patients.ts";
import { createProgrammeActionService } from "./programme-actions.ts";
import { createQualityIssueService } from "./quality-issues.ts";
import { createReferralService } from "./referrals.ts";
import { createReminderService } from "./reminders.ts";
import { createReviewService } from "./reviews.ts";
import { createScreeningService } from "./screenings.ts";
import { workersOf } from "./shared.ts";
import { createTaskService } from "./tasks.ts";

export function createServices(engine: Engine) {
  return {
    ...createPatientService(engine),
    ...createScreeningService(engine),
    ...createReviewService(engine),
    ...createReferralService(engine),
    ...createFollowUpService(engine),
    ...createTaskService(engine),
    ...createReminderService(engine),
    ...createInstructionService(engine),
    ...createMetricsService(engine),
    ...createAuditService(engine),
    ...createAccessGrantService(engine),
    ...createAdminSettingsService(engine),
    ...createProgrammeActionService(engine),
    ...createQualityIssueService(engine),
    /** Authorised CHWs for assignment (CLN-07/09); needs `task.assign` in that facility. */
    listWorkers(facilityId: string) {
      return engine.read(async (ctx) => {
        ctx.authorize(
          "task.assign",
          { facilityId: facilityId as never },
          { entityType: "facility", entityId: facilityId },
        );
        return workersOf(ctx, facilityId);
      });
    },
  };
}

export type Services = ReturnType<typeof createServices>;
