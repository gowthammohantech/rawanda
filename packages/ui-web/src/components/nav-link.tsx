import type { ComponentType, ReactNode } from "react";

/**
 * Router-agnostic link contract. React Router's `NavLink` satisfies it (apps pass
 * `LinkComponent={NavLink}`); the default is a plain `<a>` whose active state comes from
 * `activePath`.
 */
export type NavLinkLikeProps = {
  to: string;
  end?: boolean;
  className?: string | ((state: { isActive: boolean }) => string);
  children?: ReactNode;
  onClick?: () => void;
};

export type NavLinkComponent = ComponentType<NavLinkLikeProps>;

export function isPathActive(activePath: string | undefined, to: string, end = false): boolean {
  if (activePath === undefined) return false;
  if (end || to === "/") return activePath === to;
  return activePath === to || activePath.startsWith(`${to.replace(/\/$/, "")}/`);
}

/** Builds the default anchor-based link bound to `activePath`. */
export function createAnchorLink(activePath: string | undefined): NavLinkComponent {
  function AnchorLink({ to, end, className, children, onClick }: NavLinkLikeProps) {
    const isActive = isPathActive(activePath, to, end);
    return (
      <a
        href={to}
        aria-current={isActive ? "page" : undefined}
        className={typeof className === "function" ? className({ isActive }) : className}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }
  return AnchorLink;
}
