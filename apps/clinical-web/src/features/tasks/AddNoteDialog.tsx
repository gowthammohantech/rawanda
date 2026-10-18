/**
 * Append a note to a follow-up (CLN-09, FND-03 `add_note`, 3–500 characters). Notes are
 * append-only: earlier notes are never edited. Open to anyone who can see the task.
 */
import { FOLLOW_UP_NOTE_MAX, FOLLOW_UP_NOTE_MIN } from "@laif/contracts";
import type { FollowUp } from "@laif/domain";
import { Textarea, useToast, useTx } from "@laif/ui-web";
import { useState } from "react";

import { parseFollowUpUpdate, type FieldErrors } from "./model.ts";
import { TaskDialogFrame } from "./TaskDialogFrame.tsx";
import { useFollowUpAction } from "./useFollowUpAction.ts";

export type AddNoteDialogProps = {
  followUp: FollowUp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (followUp: FollowUp) => void;
};

export function AddNoteDialog({ followUp, open, onOpenChange, onSaved }: AddNoteDialogProps) {
  const t = useTx();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const close = () => onOpenChange(false);
  const action = useFollowUpAction((next) => {
    toast({ tone: "positive", title: t("clinical:tasks.toast.noteAdded") });
    onSaved?.(next);
    close();
  });

  const confirm = async () => {
    const parsed = parseFollowUpUpdate({
      followUpId: followUp.id,
      expectedVersion: followUp.version,
      action: "add_note",
      note,
    });
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    await action.submit(parsed.value);
  };

  return (
    <TaskDialogFrame
      followUp={followUp}
      action={action}
      open={open}
      onClose={close}
      testId="note-form"
      title={t("clinical:tasks.note.title")}
      description={t("clinical:tasks.note.body")}
      confirmLabel={t("clinical:tasks.note.confirm")}
      onConfirm={confirm}
      changeSummary={t("clinical:tasks.note.change")}
    >
      <Textarea
        id="task-note-text"
        label={t("clinical:tasks.note.label")}
        hint={t("clinical:tasks.note.hint", { min: FOLLOW_UP_NOTE_MIN, max: FOLLOW_UP_NOTE_MAX })}
        required
        rows={4}
        maxLength={FOLLOW_UP_NOTE_MAX}
        value={note}
        error={errors["note"]}
        onChange={(event) => setNote(event.target.value)}
      />
    </TaskDialogFrame>
  );
}
