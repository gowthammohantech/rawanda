import type {
  ReminderCancelReason,
  ReminderChannel,
  ReminderStatus,
  ReminderTiming,
} from "../enums.ts";
import type {
  CareInstructionId,
  FollowUpId,
  PatientId,
  ReminderId,
  ReminderPreferenceId,
} from "../ids.ts";
import type { IsoUtc, PersistedEntity } from "./base.ts";

/**
 * Tech spec §5.1 Reminder + extensions. Delivery is simulated. A reminder status change can
 * never transition a referral or follow-up (`assertNotCompletedByReminder`).
 */
export type Reminder = PersistedEntity & {
  id: ReminderId;
  patientId: PatientId;
  followUpId: FollowUpId | null;
  channel: ReminderChannel;
  /** Consent basis label, e.g. `citizen_opt_in` (demo). */
  consentBasis: string;
  scheduledAt: IsoUtc;
  // ext: spec `deliveryStatus (simulated)` is modelled as `status: ReminderStatus`.
  status: ReminderStatus;
  // ext: reminders hang off released care instructions (CTZ-05).
  instructionId: CareInstructionId;
  cancelReason: ReminderCancelReason | null;
  deliveredAt: IsoUtc | null;
  acknowledgedAt: IsoUtc | null;
};

/** ext (new entity): citizen reminder opt-in (CTZ-05). */
export type ReminderPreference = PersistedEntity & {
  id: ReminderPreferenceId;
  patientId: PatientId;
  optedIn: boolean;
  timing: ReminderTiming;
  channel: ReminderChannel;
};
