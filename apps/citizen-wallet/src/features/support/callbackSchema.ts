/**
 * Callback request form schema (CTZ-08 task 7). Messages are `citizen:validation.callback.*`
 * KEYS (EN + RW), so an error already on screen re-translates when the language changes. The
 * repository re-validates with the FND `CallbackRequestInputSchema` (same vocabulary).
 */
import {
  CALLBACK_NOTE_MAX,
  CALLBACK_TOPICS,
  CALLBACK_WINDOWS,
  type CallbackTopic,
  type CallbackWindow,
} from "@laif/contracts";
import { z } from "zod";

export { CALLBACK_NOTE_MAX, CALLBACK_TOPICS, CALLBACK_WINDOWS };
export type { CallbackTopic, CallbackWindow };

export const CALLBACK_MESSAGES = {
  topicRequired: "citizen:validation.callback.topicRequired",
  windowRequired: "citizen:validation.callback.windowRequired",
  noteMax: "citizen:validation.callback.noteMax",
} as const;
export type CallbackMessageKey = (typeof CALLBACK_MESSAGES)[keyof typeof CALLBACK_MESSAGES];

export const callbackSchema = z.object({
  topic: z.enum(CALLBACK_TOPICS, { error: CALLBACK_MESSAGES.topicRequired }),
  window: z.enum(CALLBACK_WINDOWS, { error: CALLBACK_MESSAGES.windowRequired }),
  note: z.string().trim().max(CALLBACK_NOTE_MAX, { error: CALLBACK_MESSAGES.noteMax }).default(""),
});
export type CallbackFormValues = z.output<typeof callbackSchema>;

export type CallbackField = "topic" | "window" | "note";
export type CallbackErrors = Partial<Record<CallbackField, CallbackMessageKey>>;

/** The form as typed (nothing chosen yet = null). */
export type CallbackDraft = {
  topic: CallbackTopic | null;
  window: CallbackWindow | null;
  note: string;
};

export function callbackErrorsOf(error: z.ZodError): CallbackErrors {
  const out: CallbackErrors = {};
  for (const issue of error.issues) {
    const head = issue.path[0];
    if ((head === "topic" || head === "window" || head === "note") && out[head] === undefined) {
      out[head] = issue.message as CallbackMessageKey;
    }
  }
  return out;
}

/** Validates a draft; `null` topic/window are reported as "please choose". */
export function validateCallback(
  draft: CallbackDraft,
): { ok: true; value: CallbackFormValues } | { ok: false; errors: CallbackErrors } {
  const parsed = callbackSchema.safeParse({
    topic: draft.topic ?? undefined,
    window: draft.window ?? undefined,
    note: draft.note,
  });
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, errors: callbackErrorsOf(parsed.error) };
}
