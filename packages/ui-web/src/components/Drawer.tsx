import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";

export type DrawerProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  /** Translated title (required: names the dialog). */
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Sticky footer actions. */
  footer?: ReactNode;
  side?: "end" | "start";
  size?: "md" | "lg";
  /** Visually hide the title (navigation drawer). */
  hideTitle?: boolean;
};

/** Side sheet on Radix Dialog (detail drawers, the mobile navigation drawer). */
export function Drawer({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  side = "end",
  size = "md",
  hideTitle = false,
}: DrawerProps) {
  const t = useTx();
  return (
    <Dialog.Root
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      {trigger === undefined ? null : <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="bg-ink/40 fixed inset-0 z-50" />
        <Dialog.Content
          {...(description === undefined ? { "aria-describedby": undefined } : {})}
          className={cx(
            "bg-surface shadow-overlay fixed inset-y-0 z-50 flex w-full flex-col",
            side === "end" ? "end-0" : "start-0",
            size === "md" ? "max-w-md" : "max-w-2xl",
          )}
        >
          <div className="border-border-soft flex items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title
                className={cx(
                  "font-display text-ink text-lg font-semibold",
                  hideTitle && "sr-only",
                )}
              >
                {title}
              </Dialog.Title>
              {description === undefined ? null : (
                <Dialog.Description className="text-muted text-sm">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label={t("common:dialog.close")}
              className="target-min rounded-pill text-muted hover:bg-background hover:text-ink inline-flex items-center justify-center"
            >
              <Icon name="close" size={20} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer === undefined ? null : (
            <div className="border-border-soft flex flex-wrap justify-end gap-2 border-t px-5 py-3">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
