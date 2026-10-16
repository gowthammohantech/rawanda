import { ICON_DATA, type IconName } from "./icon-data.ts";

export type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  /** Icons are decorative by default; pass `title` only for a standalone meaningful icon. */
  title?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 20, className, title, strokeWidth = 1.8 }: IconProps) {
  const nodes = ICON_DATA[name];
  const filled = name === "dot";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      data-icon={name}
      focusable="false"
      {...(title === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": title })}
    >
      {title === undefined ? null : <title>{title}</title>}
      {nodes.map((node, index) =>
        node[0] === "path" ? (
          <path key={index} d={node[1].d} />
        ) : (
          <circle key={index} cx={node[1].cx} cy={node[1].cy} r={node[1].r} />
        ),
      )}
    </svg>
  );
}
