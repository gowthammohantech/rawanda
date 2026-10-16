import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { RwandaMark } from "./RwandaMark.tsx";

export type BrandLoaderProps = {
  /** Fades out (prototype `.loader--leaving`). */
  leaving?: boolean;
  /** Already-translated message; defaults to `shell:brand.loading`. */
  message?: string;
  /** `fullscreen` (app boot) or `inline` (inside a page region). */
  layout?: "fullscreen" | "inline";
};

/** Radial teal loader with the sun mark; animations stop under `prefers-reduced-motion`. */
export function BrandLoader({ leaving = false, message, layout = "fullscreen" }: BrandLoaderProps) {
  const t = useTx();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!leaving}
      className={cx(
        "text-on-primary flex flex-col items-center justify-center overflow-hidden transition-[opacity,visibility] duration-300",
        "bg-[radial-gradient(circle_at_50%_38%,var(--color-loader-glow)_0,var(--color-primary-dark)_45%,var(--color-loader-deep)_100%)]",
        layout === "fullscreen" ? "fixed inset-0 z-[1000]" : "relative min-h-80 rounded-lg",
        leaving && "invisible opacity-0",
      )}
    >
      <div
        aria-hidden="true"
        className="animate-breathe rounded-pill border-on-primary/10 absolute size-[600px] border shadow-[0_0_0_90px_rgb(255_255_255/0.025),0_0_0_180px_rgb(255_255_255/0.018)] motion-reduce:animate-none"
      />
      <RwandaMark variant="inverse" className="relative" />
      <p className="text-on-primary/80 relative mt-8 text-sm">
        {message ?? t("shell:brand.loading")}
      </p>
      <div
        aria-hidden="true"
        className="rounded-pill bg-on-primary/15 relative mt-6 h-[3px] w-52 overflow-hidden"
      >
        <span className="animate-loader-bar rounded-pill bg-sun block h-full w-2/5 motion-reduce:animate-none" />
      </div>
      <p className="text-on-primary/60 absolute bottom-9 text-[11px] tracking-[1.2px] uppercase">
        {t("shell:brand.footer")}
      </p>
    </div>
  );
}
