import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { TONE_CHIP_CLASS, TONE_ICON, type Tone } from "./tone.ts";

export type ToastInput = {
  /** Translated title. */
  title: string;
  description?: string;
  tone?: Tone;
  /** ms before auto-dismiss; 0 keeps it until dismissed. Default 5000. */
  duration?: number;
};

export type ToastRecord = ToastInput & { id: number };

export type ToastApi = {
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Hosts the polite live region; wrap the app (AppShell does not do it for you). */
export function ToastProvider({ children }: { children?: ReactNode }) {
  const t = useTx();
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...input, id }]);
      const duration = input.duration ?? 5000;
      if (duration > 0)
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        aria-label={t("common:ui.notifications")}
        className="pointer-events-none fixed end-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2"
      >
        <div role="status" aria-live="polite" aria-atomic="false" className="flex flex-col gap-2">
          {toasts.map((item) => {
            const tone = item.tone ?? "positive";
            return (
              <div
                key={item.id}
                className={cx(
                  "bg-surface shadow-raised pointer-events-auto flex items-start gap-3 rounded-md border p-3",
                  TONE_CHIP_CLASS[tone],
                )}
              >
                <Icon name={TONE_ICON[tone]} size={18} className="mt-0.5 shrink-0" />
                <div className="text-ink min-w-0 flex-1">
                  <p className="text-sm font-semibold">{item.title}</p>
                  {item.description === undefined ? null : (
                    <p className="text-muted text-[13px]">{item.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label={t("common:ui.dismiss")}
                  className="target-min rounded-pill text-muted hover:text-ink inline-flex items-center justify-center"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </ToastContext.Provider>
  );
}

/** `const { toast } = useToast(); toast({ title: t('common:state.success') })`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}
