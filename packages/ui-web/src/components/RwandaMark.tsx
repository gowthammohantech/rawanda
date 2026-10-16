import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";

export type RwandaMarkProps = {
  compact?: boolean;
  /** `inverse` = on the dark teal loader background. */
  variant?: "default" | "inverse";
  /** Hide the wordmark (symbol only). */
  symbolOnly?: boolean;
  className?: string;
};

const RAYS = Array.from({ length: 12 }, (_, index) => index * 30);

/** CareConnect sun mark (ported from the prototype). */
export function RwandaMark({
  compact = false,
  variant = "default",
  symbolOnly = false,
  className,
}: RwandaMarkProps) {
  const t = useTx();
  const symbol = compact ? 34 : variant === "inverse" ? 86 : 42;
  const ray = compact ? { top: 3, height: 8, origin: 14 } : { top: 5, height: 9, origin: 16 };
  const scale = symbol / (compact ? 34 : 42);
  return (
    <div
      className={cx(
        "flex items-center gap-3",
        variant === "inverse" && "flex-col gap-5 text-center",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cx(
          "rounded-pill relative grid shrink-0 place-items-center overflow-hidden",
          variant === "inverse" ? "bg-surface shadow-overlay" : "bg-primary",
        )}
        style={{ width: symbol, height: symbol }}
      >
        <span
          className="rounded-pill bg-sun z-[2]"
          style={{ width: (compact ? 12 : 15) * scale, height: (compact ? 12 : 15) * scale }}
        />
        {RAYS.map((deg) => (
          <span
            key={deg}
            className="bg-sun absolute rounded-[2px]"
            style={{
              width: 2 * scale,
              height: ray.height * scale,
              top: ray.top * scale,
              left: symbol / 2 - scale,
              transformOrigin: `${scale}px ${ray.origin * scale}px`,
              transform: `rotate(${deg}deg)`,
            }}
          />
        ))}
      </div>
      {symbolOnly ? (
        <span className="sr-only">{t("shell:brand.name")}</span>
      ) : (
        <div className="flex flex-col leading-none">
          <strong
            className={cx(
              "font-display font-bold tracking-tight",
              variant === "inverse" ? "text-on-primary text-[31px]" : "text-primary-dark",
              variant !== "inverse" && (compact ? "text-base" : "text-lg"),
            )}
          >
            {t("shell:brand.name")}
          </strong>
          <span
            className={cx(
              "mt-1 font-bold uppercase",
              variant === "inverse"
                ? "text-sun text-[13px] tracking-[5px]"
                : "text-muted text-[9px] tracking-[2.5px]",
            )}
          >
            {t("shell:brand.country")}
          </span>
        </div>
      )}
    </div>
  );
}
