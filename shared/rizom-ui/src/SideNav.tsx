import type { JSX } from "preact";
import type { RizomSideNavItem } from "./types";

interface SideNavProps {
  items: RizomSideNavItem[];
}

export const SideNav = ({ items }: SideNavProps): JSX.Element => (
  <aside
    aria-hidden="true"
    className="fixed right-8 top-1/2 z-[90] hidden -translate-y-1/2 flex-col gap-[18px] px-2 py-4 xl:flex"
  >
    {items.map((dot) => (
      <a
        key={dot.href}
        href={dot.href}
        className="side-nav-dot"
        data-label={dot.label}
      />
    ))}
  </aside>
);
