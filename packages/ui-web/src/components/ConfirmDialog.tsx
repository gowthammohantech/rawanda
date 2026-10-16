import { hasMinimumReason, MIN_REASON_NON_WHITESPACE_CHARS } from "@laif/domain";
import * as Dialog from "@radix-ui/react-dialog";
import { useId, useState, type ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { Button } from "./Button.tsx";
import { CONTROL_CLASS } from "./Field.tsx";

export type ConfirmDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional trigger element (focus returns to it on close). */
  trigger?: ReactNode;
  /** Translated title. */
  title: ReactNode;
  /** Translated description / structured summary. */
  description?: ReactNode;
  /** Extra body content (forms, summaries). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive styling (danger confirm button + warning icon + "cannot be undone"). */
  variant?: "default" | "destructive";
  /**
   * Required-reason variant: shows a textarea and keeps Confirm disabled until the reason has
   * ≥ 10 non-whitespace characters (FND-02 `MIN_REASON_NON_WHITESPACE_CHARS`).
   */
  requireReason?: boolean;
  reasonLabel?: string;
  /** Confirm also stays disabled while this is true (e.g. a form inside is invalid). */
  confirmDisabled?: boolean;
  /** Saving: Confirm shows busy and the dialog cannot be dismissed. */
  loading?: boolean;
  /** Receives the trimmed reason in the reason variant. May return a promise. */
  onConfirm: (reason?: string) => unknown;
};

/** Radix confirmation dialog: traps focus, Escape closes, focus returns to the trigger. */
export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  variant = "default",
  requireReason = false,
  reasonLabel,
  confirmDisabled = false,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const t = useTx();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;

  // Reset the reason whenever the dialog closes (state adjustment during render, no effect).
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen) setReason("");
  }

  const setOpen = (next: boolean) => {
    if (!next && loading) return;
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const reasonValid = !requireReason || hasMinimumReason(reason);
  const nonWhitespace = reason.replace(/\s/gu, "").length;
  const destructive = variant === "destructive";

  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen}>
      {trigger === undefined ? null : <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="bg-ink/40 fixed inset-0 z-50" />
        <Dialog.Content
          className="bg-surface shadow-overlay fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl p-6"
          onEscapeKeyDown={(event) => {
            if (loading) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (loading) event.preventDefault();
          }}
          {...(description === undefined ? { "aria-describedby": undefined } : {})}
        >
          <div className="flex items-start gap-3">
            {destructive ? (
              <span className="rounded-pill bg-danger-soft text-danger inline-flex size-9 shrink-0 items-center justify-center">
                <Icon name="alert" size={18} />
              </span>
            ) : null}
            <div className="min-w-0 flex-1 space-y-2">
              <Dialog.Title className="font-display text-ink text-lg font-semibold">
                {title}
              </Dialog.Title>
              {description === undefined ? null : (
                <Dialog.Description className="text-muted text-sm">
                  {description}
                </Dialog.Description>
              )}
              {destructive ? (
                <p className="text-danger text-[13px] font-medium">
                  {t("common:dialog.cannotUndo")}
                </p>
              ) : null}
            </div>
          </div>

          {children === undefined ? null : <div className="mt-4">{children}</div>}

          {requireReason ? (
            <div className="mt-4 flex flex-col gap-1.5">
              <label htmlFor={reasonId} className="text-ink text-[13px] font-medium">
                {reasonLabel ?? t("common:dialog.reasonLabel")}
              </label>
              <textarea
                id={reasonId}
                value={reason}
                rows={3}
                maxLength={500}
                required
                aria-describedby={`${reasonId}-hint ${reasonId}-count`}
                onChange={(event) => setReason(event.target.value)}
                className={cx(CONTROL_CLASS, "border-border")}
              />
              <p id={`${reasonId}-hint`} className="text-muted text-xs">
                {t("common:dialog.reasonHint", { min: MIN_REASON_NON_WHITESPACE_CHARS })}
              </p>
              <p
                id={`${reasonId}-count`}
                aria-live="polite"
                className={cx("text-xs tabular-nums", reasonValid ? "text-positive" : "text-muted")}
              >
                {t("common:dialog.reasonProgress", {
                  count: nonWhitespace,
                  min: MIN_REASON_NON_WHITESPACE_CHARS,
                })}
              </p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="secondary" disabled={loading}>
                {cancelLabel ?? t("common:actions.cancel")}
              </Button>
            </Dialog.Close>
            <Button
              variant={destructive ? "danger" : "primary"}
              loading={loading}
              disabled={confirmDisabled || !reasonValid}
              onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
            >
              {loading ? t("common:dialog.saving") : (confirmLabel ?? t("common:actions.confirm"))}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
